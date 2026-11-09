"""FastAPI interface for owner-scoped agent sessions."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

import ai
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, field_validator

from myagent.adapter.ai_sdk import create_model
from myagent.agents.myagent import SYSTEM_PROMPT
from myagent.auth import (
    ACCESS_TOKEN_TTL_SECONDS,
    AccountAlreadyExists,
    AuthRateLimitExceeded,
    SQLiteAuthStore,
)
from myagent.sessions import (
    SQLiteSessionStore,
    SessionBusy,
    SessionManager,
    SessionNotFound,
    SessionSummary,
)
from myagent.tools import ToolContext

logger = logging.getLogger(__name__)
load_dotenv()

SIGNUP_ATTEMPT_LIMIT = 5
SIGNUP_WINDOW_SECONDS = 60 * 60
SIGNIN_IP_ATTEMPT_LIMIT = 30
SIGNIN_EMAIL_ATTEMPT_LIMIT = 10
SIGNIN_WINDOW_SECONDS = 15 * 60
MESSAGE_ATTEMPT_LIMIT = 30
MESSAGE_WINDOW_SECONDS = 60


class CreateMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=100_000)


class AuthCredentials(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().casefold()
        local, separator, domain = normalized.partition("@")
        if (
            not separator
            or not local
            or not domain
            or "@" in domain
            or any(character.isspace() for character in normalized)
        ):
            raise ValueError("A valid email address is required.")
        return normalized


class AuthTokenResponse(BaseModel):
    user_id: str
    email: str
    access_token: str
    token_type: str = "bearer"
    expires_in: int = ACCESS_TOKEN_TTL_SECONDS


class SessionResponse(BaseModel):
    session_id: str
    created_at: str
    updated_at: str
    last_turn_status: str | None


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]


class MessageResponse(BaseModel):
    session_id: str
    response: str


class HistoryMessage(BaseModel):
    index: int
    role: str
    content: str


class SessionHistoryResponse(BaseModel):
    session_id: str
    messages: list[HistoryMessage]


def _parse_api_tokens(raw: str | None) -> dict[str, str]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        raise ValueError("MYAGENT_API_TOKENS must be a JSON object.") from error
    if not isinstance(parsed, dict) or any(
        not isinstance(token, str)
        or not token
        or not isinstance(owner_id, str)
        or not owner_id.strip()
        for token, owner_id in parsed.items()
    ):
        raise ValueError(
            "MYAGENT_API_TOKENS must map non-empty bearer tokens to owner IDs."
        )
    return parsed


def _session_response(summary: SessionSummary) -> SessionResponse:
    return SessionResponse(
        session_id=summary.id,
        created_at=summary.created_at,
        updated_at=summary.updated_at,
        last_turn_status=summary.last_turn_status,
    )


def create_app(
    *,
    store: SQLiteSessionStore | None = None,
    auth_store: SQLiteAuthStore | None = None,
    model: ai.Model | None = None,
    api_tokens: Mapping[str, str] | None = None,
    data_dir: str | Path | None = None,
    workspace_root: str | Path | None = None,
    agent_factory: Callable[[ToolContext], Any] | None = None,
    signup_enabled: bool | None = None,
) -> FastAPI:
    """Create an API app; each bearer token resolves to one trusted owner ID."""
    resolved_data_dir = Path(
        data_dir or os.getenv("MYAGENT_DATA_DIR", "~/.myagent")
    ).expanduser().resolve()
    resolved_workspace_root = Path(
        workspace_root or os.getenv(
            "MYAGENT_API_WORKSPACE_ROOT",
            str(resolved_data_dir / "workspaces"),
        )
    ).expanduser().resolve()
    session_store = store
    tokens = (
        dict(api_tokens)
        if api_tokens is not None
        else _parse_api_tokens(os.getenv("MYAGENT_API_TOKENS"))
    )
    app = FastAPI(title="myagent", version="0.1.0")
    app.state.session_store = session_store
    app.state.auth_store = auth_store
    app.state.data_dir = resolved_data_dir
    app.state.workspace_root = resolved_workspace_root
    app.state.api_tokens = tokens
    app.state.model = model
    app.state.agent_factory = agent_factory
    app.state.signup_enabled = (
        signup_enabled
        if signup_enabled is not None
        else os.getenv("MYAGENT_SIGNUP_ENABLED", "false").strip().lower()
        in {"1", "true", "yes", "on"}
    )
    bearer = HTTPBearer(auto_error=False)

    def current_owner(
        request: Request,
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> str:
        configured_tokens: dict[str, str] = request.app.state.api_tokens
        if credentials is None or credentials.scheme.lower() != "bearer":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="A bearer token is required.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        owner_id: str | None = None
        for token, configured_owner in configured_tokens.items():
            if hmac.compare_digest(credentials.credentials, token):
                owner_id = configured_owner
        if owner_id is None:
            owner_id = auth_store_for().owner_for_access_token(credentials.credentials)
        if owner_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid bearer token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return owner_id

    def auth_store_for() -> SQLiteAuthStore:
        if app.state.auth_store is None:
            app.state.auth_store = SQLiteAuthStore(
                resolved_data_dir / "auth.sqlite3"
            )
        return app.state.auth_store

    def enforce_auth_rate_limit(
        request: Request, action: str, *, email: str | None = None
    ) -> None:
        store_for_auth = auth_store_for()
        # request.client.host is supplied by ASGI. Forwarded headers are
        # intentionally ignored unless a trusted proxy middleware is configured.
        client_host = request.client.host if request.client else "unknown"
        try:
            if action == "signup":
                store_for_auth.consume_rate_limit(
                    f"signup:ip:{client_host}",
                    limit=SIGNUP_ATTEMPT_LIMIT,
                    window_seconds=SIGNUP_WINDOW_SECONDS,
                )
                return
            store_for_auth.consume_rate_limit(
                f"signin:ip:{client_host}",
                limit=SIGNIN_IP_ATTEMPT_LIMIT,
                window_seconds=SIGNIN_WINDOW_SECONDS,
            )
            if email is not None:
                email_hash = hashlib.sha256(email.casefold().encode("utf-8")).hexdigest()
                store_for_auth.consume_rate_limit(
                    f"signin:email:{email_hash}",
                    limit=SIGNIN_EMAIL_ATTEMPT_LIMIT,
                    window_seconds=SIGNIN_WINDOW_SECONDS,
                )
        except AuthRateLimitExceeded as error:
            logger.warning(
                "Authentication rate limit exceeded",
                extra={"event": "auth_rate_limited", "auth_action": action},
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=str(error),
                headers={"Retry-After": str(error.retry_after_seconds)},
            ) from error

    def enforce_message_rate_limit(owner_id: str) -> None:
        owner_key = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()
        try:
            auth_store_for().consume_rate_limit(
                f"messages:owner:{owner_key}",
                limit=MESSAGE_ATTEMPT_LIMIT,
                window_seconds=MESSAGE_WINDOW_SECONDS,
            )
        except AuthRateLimitExceeded as error:
            logger.warning(
                "Message rate limit exceeded",
                extra={"event": "message_rate_limited", "owner_id": owner_id},
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many messages; try again later.",
                headers={"Retry-After": str(error.retry_after_seconds)},
            ) from error

    def sessions_for(owner_id: str) -> SessionManager:
        if app.state.session_store is None:
            app.state.session_store = SQLiteSessionStore(
                resolved_data_dir / "sessions.sqlite3"
            )
        owner_key = hashlib.sha256(owner_id.encode("utf-8")).hexdigest()[:24]
        return SessionManager(
            app.state.session_store,
            owner_id=owner_id,
            data_dir=resolved_data_dir,
            workspace_root=resolved_workspace_root / owner_key,
            persona_root=resolved_data_dir / "personas" / owner_key,
            agent_factory=agent_factory,
            session_scoped_context=True,
        )

    def get_model() -> ai.Model:
        if app.state.model is None:
            try:
                app.state.model = create_model()
            except RuntimeError as error:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="The model provider is not configured.",
                ) from error
        return app.state.model

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post(
        "/auth/signup",
        response_model=AuthTokenResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def signup(
        body: AuthCredentials, request: Request, response: Response
    ) -> AuthTokenResponse:
        if not request.app.state.signup_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Public signup is disabled.",
            )
        enforce_auth_rate_limit(request, "signup")
        account_store = auth_store_for()
        try:
            user = account_store.register(body.email, body.password)
        except AccountAlreadyExists as error:
            logger.info("Signup rejected", extra={"event": "auth_signup_rejected"})
            raise HTTPException(status_code=409, detail=str(error)) from error
        access_token = account_store.create_access_token(user.id)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        logger.info("Signup succeeded", extra={"event": "auth_signup_succeeded", "user_id": user.id})
        return AuthTokenResponse(
            user_id=user.id,
            email=user.email,
            access_token=access_token,
        )

    @app.post("/auth/signin", response_model=AuthTokenResponse)
    def signin(
        body: AuthCredentials, request: Request, response: Response
    ) -> AuthTokenResponse:
        enforce_auth_rate_limit(request, "signin", email=body.email)
        account_store = auth_store_for()
        user = account_store.authenticate(body.email, body.password)
        if user is None:
            logger.warning("Signin failed", extra={"event": "auth_signin_failed"})
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        access_token = account_store.create_access_token(user.id)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
        logger.info("Signin succeeded", extra={"event": "auth_signin_succeeded", "user_id": user.id})
        return AuthTokenResponse(
            user_id=user.id,
            email=user.email,
            access_token=access_token,
        )

    @app.post("/auth/signout", status_code=status.HTTP_204_NO_CONTENT)
    def signout(
        request: Request,
        owner_id: str = Depends(current_owner),
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ) -> Response:
        if credentials is None or not auth_store_for().revoke_access_token(
            credentials.credentials, owner_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This operator-managed token cannot be revoked here.",
            )
        logger.info("Signout succeeded", extra={"event": "auth_signout_succeeded", "user_id": owner_id})
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post(
        "/sessions",
        response_model=SessionResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_session(
        owner_id: str = Depends(current_owner),
    ) -> SessionResponse:
        manager = sessions_for(owner_id)
        summary = manager.create_session([ai.system_message(SYSTEM_PROMPT)])
        return _session_response(summary)

    @app.get("/sessions", response_model=SessionListResponse)
    def list_sessions(
        owner_id: str = Depends(current_owner),
    ) -> SessionListResponse:
        return SessionListResponse(
            sessions=[
                _session_response(summary)
                for summary in sessions_for(owner_id).list_sessions()
            ]
        )

    @app.get("/sessions/{session_id}", response_model=SessionResponse)
    def get_session(
        session_id: str,
        owner_id: str = Depends(current_owner),
    ) -> SessionResponse:
        try:
            return _session_response(sessions_for(owner_id).load_session(session_id).summary)
        except SessionNotFound as error:
            raise HTTPException(status_code=404, detail="Session not found.") from error
        except SessionBusy as error:
            raise HTTPException(status_code=409, detail="Session is busy.") from error

    @app.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_session(
        session_id: str,
        owner_id: str = Depends(current_owner),
    ) -> Response:
        try:
            sessions_for(owner_id).delete_session(session_id)
        except SessionNotFound as error:
            raise HTTPException(status_code=404, detail="Session not found.") from error
        except SessionBusy as error:
            raise HTTPException(status_code=409, detail="Session is busy.") from error
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.post(
        "/sessions/{session_id}/messages",
        response_model=MessageResponse,
    )
    async def send_message(
        session_id: str,
        body: CreateMessageRequest,
        owner_id: str = Depends(current_owner),
        model: ai.Model = Depends(get_model),
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ) -> MessageResponse:
        enforce_message_rate_limit(owner_id)
        manager = sessions_for(owner_id)
        try:
            answer = await manager.run_turn(
                session_id,
                body.content,
                model,
                request_id=idempotency_key,
            )
        except SessionNotFound as error:
            raise HTTPException(status_code=404, detail="Session not found.") from error
        except SessionBusy as error:
            raise HTTPException(status_code=409, detail="Session is busy.") from error
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except Exception as error:
            logger.error(
                "Agent turn failed",
                extra={"event": "api_turn_failed", "session_id": session_id},
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Agent request failed.",
            ) from error
        return MessageResponse(session_id=session_id, response=answer)

    @app.get(
        "/sessions/{session_id}/messages",
        response_model=SessionHistoryResponse,
    )
    def get_messages(
        session_id: str,
        owner_id: str = Depends(current_owner),
    ) -> SessionHistoryResponse:
        try:
            state = sessions_for(owner_id).load_session(session_id)
        except SessionNotFound as error:
            raise HTTPException(status_code=404, detail="Session not found.") from error
        except SessionBusy as error:
            raise HTTPException(status_code=409, detail="Session is busy.") from error
        messages = [
            HistoryMessage(index=index, role=message.role, content=message.text)
            for index, message in enumerate(state.messages)
            if message.role in {"user", "assistant"} and message.text
        ]
        return SessionHistoryResponse(session_id=session_id, messages=messages)

    return app


app = create_app()


def main() -> None:
    uvicorn.run(
        "myagent.api:app",
        host=os.getenv("MYAGENT_API_HOST", "127.0.0.1"),
        port=int(os.getenv("MYAGENT_API_PORT", "8000")),
    )
