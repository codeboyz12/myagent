"""FastAPI interface for owner-scoped agent sessions."""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import os
import socket
import uuid
import asyncio
from importlib.resources import files
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any, Literal

import ai
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from urllib.parse import urlsplit

from myagent.adapter.ai_sdk import (
    create_compatible_model,
    discover_model_catalog,
)
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
from myagent.settings import SQLiteUserSettingsStore
from myagent.tools import ToolContext
from myagent.tools.mcp import MCPServerConfig, validate_mcp_url
from myagent.tools.skills import _skill_dirs

OPENUI_SYSTEM_PROMPT = (
    files("myagent").joinpath("prompt/openui_system_prompt.txt").read_text(encoding="utf-8")
)

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
    model_id: str | None = Field(default=None, min_length=1, max_length=256)
    reasoning_effort: Literal["default", "low", "medium", "high"] | None = None
    model_controls: dict[str, str | None] = Field(default_factory=dict, max_length=12)
    # Deprecated compatibility input. The backend always uses its packaged prompt resource.
    openui_instructions: str | None = Field(default=None, max_length=20_000)


class ModelSettingsDiscoveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: str = Field(min_length=8, max_length=2048)
    api_key: str | None = Field(default=None, max_length=4096)
    provider_id: str | None = Field(default=None, max_length=64)


class ModelSettingsSaveRequest(ModelSettingsDiscoveryRequest):
    model_id: str | None = Field(default=None, min_length=1, max_length=256)
    reasoning_effort: Literal["default", "low", "medium", "high"] = "default"
    clear_api_key: bool = False


class ModelSettingsSelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(min_length=1, max_length=256)
    reasoning_effort: Literal["default", "low", "medium", "high"] = "default"


class ModelControlOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=64)
    value: str = Field(min_length=1, max_length=128)


class ModelControlDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=80)
    parameter: str = Field(min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_.-]+$")
    options: list[ModelControlOption] = Field(min_length=1, max_length=12)
    default_value: str | None = None

    @model_validator(mode="after")
    def validate_control_options(self) -> ModelControlDefinition:
        values = [option.value for option in self.options]
        if len(set(values)) != len(values):
            raise ValueError("Control option values must be unique.")
        if self.default_value is not None and self.default_value not in values:
            raise ValueError("The default must match one of the control options.")
        return self


class ModelControlSelectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_id: str = Field(min_length=1, max_length=256)
    control_id: str = Field(min_length=1, max_length=64)
    value: str | None = Field(default=None, max_length=128)


class ModelProviderRequest(ModelSettingsDiscoveryRequest):
    name: str = Field(min_length=1, max_length=80)
    model_id: str = Field(min_length=1, max_length=256)
    reasoning_effort: Literal["default", "low", "medium", "high"] = "default"
    enabled: bool = True
    clear_api_key: bool = False
    model_controls: list[ModelControlDefinition] = Field(default_factory=list, max_length=12)


class ModelProviderEnabledRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool


class ActiveModelProviderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_id: str = Field(min_length=1, max_length=64)


class LibraryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    content: str = Field(min_length=1, max_length=20000)
    enabled: bool = True
    built_in: bool = False


class LibrarySettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skills: list[LibraryItem] = Field(max_length=100)
    personas: list[LibraryItem] = Field(max_length=100)


class MCPServerSetting(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=48, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=80)
    transport: Literal["http"] = "http"
    url: str = Field(min_length=8, max_length=2048)
    enabled: bool = True
    built_in: bool = False
    token: str | None = Field(default=None, max_length=4096)
    clear_token: bool = False

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        try:
            return validate_mcp_url(value)
        except ValueError as error:
            raise ValueError(str(error)) from error

    @model_validator(mode="after")
    def validate_bearer_transport(self) -> MCPServerSetting:
        hostname = urlsplit(self.url).hostname
        local_http = urlsplit(self.url).scheme == "http" and hostname in {
            "localhost", "127.0.0.1", "::1",
        }
        if self.token and urlsplit(self.url).scheme != "https" and not local_http:
            raise ValueError("Bearer tokens require HTTPS, except for loopback MCP servers.")
        return self


class MCPSettingsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    builtin_enabled: bool = True
    servers: list[MCPServerSetting] = Field(max_length=50)


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
    title: str | None = None


class RenameSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Session title cannot be empty.")
        return normalized


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]


class ToolActivity(BaseModel):
    tool_call_id: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    status: Literal["running", "completed", "error"]
    sources: list[dict[str, str]] = Field(default_factory=list)
    images: list[dict[str, str]] = Field(default_factory=list)


class MessageResponse(BaseModel):
    session_id: str
    response: str
    tool_events: list[ToolActivity] = Field(default_factory=list)


def _tool_activities(events: list[dict[str, Any]]) -> list[ToolActivity]:
    activities: dict[str, ToolActivity] = {}
    for event in events:
        payload = event.get("payload", {})
        if not isinstance(payload, dict):
            continue
        call_id = payload.get("tool_call_id")
        tool_name = payload.get("tool_name")
        if not isinstance(call_id, str) or not isinstance(tool_name, str):
            continue
        if event.get("event_type") == "tool_started":
            arguments = payload.get("arguments", {})
            activities[call_id] = ToolActivity(
                tool_call_id=call_id,
                tool_name=tool_name,
                arguments=arguments if isinstance(arguments, dict) else {},
                status="running",
            )
        elif event.get("event_type") == "tool_completed" and call_id in activities:
            completed_arguments = payload.get("arguments")
            update: dict[str, Any] = {
                "status": "error" if payload.get("is_error") else "completed"
            }
            if isinstance(completed_arguments, dict) and completed_arguments:
                update["arguments"] = completed_arguments
            sources = payload.get("sources")
            if isinstance(sources, list):
                update["sources"] = [
                    {key: source[key] for key in ("url", "title") if isinstance(source.get(key), str)}
                    for source in sources
                    if isinstance(source, dict)
                    and isinstance(source.get("url"), str)
                    and source["url"].startswith(("http://", "https://"))
                ][:12]
            images = payload.get("images")
            if isinstance(images, list):
                update["images"] = [
                    {key: image[key] for key in ("url", "source_url", "title") if isinstance(image.get(key), str)}
                    for image in images
                    if isinstance(image, dict)
                    and isinstance(image.get("url"), str)
                    and image["url"].startswith("https://")
                    and isinstance(image.get("source_url"), str)
                    and image["source_url"].startswith("https://")
                ][:6]
            activities[call_id] = activities[call_id].model_copy(update=update)
    return list(activities.values())


class HistoryMessage(BaseModel):
    index: int
    role: str
    content: str
    tool_events: list[ToolActivity] = Field(default_factory=list)


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
        title=summary.title,
    )


def _normalize_model_base_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    parsed = urlsplit(normalized)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Enter an HTTP(S) model endpoint URL without credentials or query parameters.")
    allow_private = os.getenv("MYAGENT_ALLOW_PRIVATE_MODEL_ENDPOINTS", "false").lower() in {
        "1", "true", "yes", "on"
    }
    if not allow_private:
        try:
            addresses = {
                ipaddress.ip_address(result[4][0])
                for result in socket.getaddrinfo(
                    parsed.hostname,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                    type=socket.SOCK_STREAM,
                )
            }
        except (OSError, ValueError) as error:
            raise ValueError("The model endpoint host could not be resolved.") from error
        if not addresses or any(not address.is_global for address in addresses):
            raise ValueError(
                "Private model endpoints require MYAGENT_ALLOW_PRIVATE_MODEL_ENDPOINTS=true."
            )
    return normalized


def _deduplicate_model_providers(
    owner_id: str,
    providers: list[dict[str, Any]],
    active_provider_id: str | None,
    store: SQLiteUserSettingsStore,
) -> tuple[list[dict[str, Any]], str | None]:
    """Collapse repeated endpoint/model/credential entries without losing settings."""
    groups: dict[tuple[str, str, str | None], list[dict[str, Any]]] = {}
    for provider in providers:
        api_key = store.get_secret(
            owner_id, MODEL_PROVIDERS_NAMESPACE, f"api_key:{provider['id']}"
        )
        identity = (
            str(provider.get("base_url", "")).rstrip("/"),
            str(provider.get("model_id", "")),
            api_key,
        )
        groups.setdefault(identity, []).append(provider)

    collapsed: list[dict[str, Any]] = []
    removed_ids: list[str] = []
    for matches in groups.values():
        if len(matches) == 1:
            collapsed.extend(matches)
            continue

        preferred = next(
            (item for item in matches if item.get("id") == active_provider_id),
            next((item for item in matches if item.get("enabled") is True), matches[0]),
        )
        merged = dict(preferred)
        model_controls: dict[str, Any] = {}
        selections: dict[str, Any] = {}
        models: dict[str, dict[str, Any]] = {}
        for item in [*(match for match in matches if match is not preferred), preferred]:
            model_controls.update(item.get("model_controls", {}))
            for model in item.get("models", []):
                if isinstance(model, dict) and isinstance(model.get("id"), str):
                    models[model["id"]] = model
            for model_id, values in item.get("model_control_selections", {}).items():
                existing = selections.setdefault(model_id, {})
                existing.update(values)
            if item is not preferred:
                removed_ids.append(str(item["id"]))
        merged["model_controls"] = model_controls
        merged["model_control_selections"] = selections
        if models:
            merged["models"] = list(models.values())
        merged["enabled"] = any(item.get("enabled") is True for item in matches)
        collapsed.append(merged)
        if active_provider_id in {item.get("id") for item in matches}:
            active_provider_id = str(preferred["id"])

    if removed_ids:
        enabled_ids = {item["id"] for item in collapsed if item.get("enabled") is True}
        if active_provider_id not in enabled_ids:
            active_provider_id = next(
                (item["id"] for item in collapsed if item.get("enabled") is True), None
            )
        store.save(
            owner_id,
            MODEL_PROVIDERS_NAMESPACE,
            schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
            values={"providers": collapsed},
            clear_secrets=tuple(f"api_key:{provider_id}" for provider_id in removed_ids),
        )
        store.save(
            owner_id,
            MODEL_SETTINGS_NAMESPACE,
            schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
            values={"active_provider_id": active_provider_id},
        )
    return collapsed, active_provider_id


MODEL_SETTINGS_NAMESPACE = "model"
MODEL_SETTINGS_SCHEMA_VERSION = 1
MODEL_PROVIDERS_NAMESPACE = "model-providers"


def create_app(
    *,
    store: SQLiteSessionStore | None = None,
    auth_store: SQLiteAuthStore | None = None,
    model: ai.Model | None = None,
    api_tokens: Mapping[str, str] | None = None,
    data_dir: str | Path | None = None,
    workspace_root: str | Path | None = None,
    agent_factory: Callable[[ToolContext], Any] | None = None,
    user_settings_store: SQLiteUserSettingsStore | None = None,
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
    app.state.user_settings_store = user_settings_store or SQLiteUserSettingsStore(
        resolved_data_dir / "auth.sqlite3"
    )
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

    def settings_store_for() -> SQLiteUserSettingsStore:
        return app.state.user_settings_store

    def model_provider_state(
        owner_id: str,
    ) -> tuple[list[dict[str, Any]], str | None]:
        store_for_settings = settings_store_for()
        provider_record = store_for_settings.get(
            owner_id, MODEL_PROVIDERS_NAMESPACE
        )
        if provider_record is None:
            legacy = store_for_settings.get(owner_id, MODEL_SETTINGS_NAMESPACE)
            legacy_values = legacy["values"] if legacy else {}
            providers: list[dict[str, Any]] = []
            active_provider_id = None
            if isinstance(legacy_values.get("base_url"), str):
                parsed = urlsplit(legacy_values["base_url"])
                provider_id = uuid.uuid4().hex
                providers.append(
                    {
                        "id": provider_id,
                        "name": parsed.hostname or "OpenAI-compatible API",
                        "base_url": legacy_values["base_url"],
                        "model_id": legacy_values.get("model_id", ""),
                        "reasoning_effort": legacy_values.get(
                            "reasoning_effort", "default"
                        ),
                        "enabled": True,
                        "model_controls": {
                            legacy_values.get("model_id", ""): [
                                {
                                    "id": "thinking",
                                    "name": "Thinking",
                                    "parameter": "reasoning_effort",
                                    "options": [
                                        {"label": "Low", "value": "low"},
                                        {"label": "Medium", "value": "medium"},
                                        {"label": "High", "value": "high"},
                                    ],
                                    "default_value": (
                                        legacy_values.get("reasoning_effort")
                                        if legacy_values.get("reasoning_effort")
                                        in {"low", "medium", "high"}
                                        else None
                                    ),
                                }
                            ]
                        },
                        "model_control_selections": {},
                    }
                )
                legacy_key = store_for_settings.get_secret(
                    owner_id, MODEL_SETTINGS_NAMESPACE, "api_key"
                )
                store_for_settings.save(
                    owner_id,
                    MODEL_PROVIDERS_NAMESPACE,
                    schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
                    values={"providers": providers},
                    secrets=(
                        {f"api_key:{provider_id}": legacy_key}
                        if legacy_key
                        else None
                    ),
                )
                active_provider_id = provider_id
                store_for_settings.save(
                    owner_id,
                    MODEL_SETTINGS_NAMESPACE,
                    schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
                    values={"active_provider_id": active_provider_id},
                )
            return providers, active_provider_id

        values = provider_record["values"]
        providers = values.get("providers", [])
        if not isinstance(providers, list):
            providers = []
        active_record = store_for_settings.get(owner_id, MODEL_SETTINGS_NAMESPACE)
        active_values = active_record["values"] if active_record else {}
        active_provider_id = active_values.get("active_provider_id")
        if active_provider_id not in {
            provider["id"]
            for provider in providers
            if isinstance(provider, dict) and provider.get("enabled") is True
        }:
            active_provider_id = next(
                (
                    provider["id"]
                    for provider in providers
                    if isinstance(provider, dict) and provider.get("enabled") is True
                ),
                None,
            )
        providers, active_provider_id = _deduplicate_model_providers(
            owner_id, providers, active_provider_id, store_for_settings
        )
        return providers, active_provider_id

    def save_model_provider_state(
        owner_id: str,
        providers: list[dict[str, Any]],
        active_provider_id: str | None,
    ) -> None:
        store_for_settings = settings_store_for()
        store_for_settings.save(
            owner_id,
            MODEL_PROVIDERS_NAMESPACE,
            schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
            values={"providers": providers},
        )
        store_for_settings.save(
            owner_id,
            MODEL_SETTINGS_NAMESPACE,
            schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
            values={"active_provider_id": active_provider_id},
        )

    def active_model_provider(
        owner_id: str,
    ) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        providers, active_provider_id = model_provider_state(owner_id)
        active = next(
            (
                provider
                for provider in providers
                if provider.get("id") == active_provider_id
                and provider.get("enabled") is True
            ),
            None,
        )
        return providers, active

    def public_model_provider(owner_id: str, provider: dict[str, Any]) -> dict[str, Any]:
        models = provider.get("models")
        if not isinstance(models, list) or not models:
            models = [{"id": provider["model_id"], "name": provider["model_id"]}]
        return {
            **provider,
            "models": models,
            "model_controls": provider.get("model_controls", {}),
            "model_control_selections": provider.get("model_control_selections", {}),
            "api_key_configured": settings_store_for().has_secret(
                owner_id,
                MODEL_PROVIDERS_NAMESPACE,
                f"api_key:{provider['id']}",
            ),
        }

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
            library=library_for(owner_id),
            mcp_servers=mcp_servers_for(owner_id),
            agent_factory=agent_factory,
            session_scoped_context=True,
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    def library_defaults() -> dict[str, list[dict[str, Any]]]:
        skills: list[dict[str, Any]] = []
        for prefix, root in _skill_dirs():
            if not root.is_dir():
                continue
            for folder in sorted(root.iterdir()):
                skill_file = folder / "SKILL.md"
                if not skill_file.is_file():
                    continue
                content = skill_file.read_text(encoding="utf-8")
                name = folder.name
                description = "Built-in skill"
                for line in content.splitlines():
                    if line.strip().startswith("name:"):
                        name = line.split(":", 1)[1].strip().strip("\"'")
                    if line.strip().lower().startswith("description:"):
                        description = line.split(":", 1)[1].strip().strip("\"'")
                        break
                skills.append({"id": (prefix + folder.name).replace("/", "-"), "name": name, "description": description, "content": content, "enabled": True, "built_in": True})
        personas = [{"id": "default", "name": "Helpful assistant", "description": "A clear, capable general-purpose assistant.", "content": "Be helpful, clear, and accurate. Ask focused questions when needed.", "enabled": True, "built_in": True}]
        return {"skills": skills, "personas": personas}

    def library_for(owner_id: str) -> dict[str, list[dict[str, Any]]]:
        defaults = library_defaults()
        record = settings_store_for().get(owner_id, "agent_library")
        saved = record["values"] if record else {}
        result: dict[str, list[dict[str, Any]]] = {}
        for kind in ("skills", "personas"):
            saved_items = {item["id"]: item for item in saved.get(kind, [])}
            merged = []
            for item in defaults[kind]:
                stored = saved_items.pop(item["id"], {})
                merged.append({**item, "enabled": stored.get("enabled", True)})
            merged.extend(item for item in saved_items.values() if not item.get("built_in"))
            result[kind] = merged
        return result

    def mcp_settings_for(owner_id: str) -> dict[str, Any]:
        record = settings_store_for().get(owner_id, "mcp_servers")
        saved = record["values"] if record else {}
        builtin_enabled = saved.get("builtin_enabled", True)
        custom = []
        for item in saved.get("servers", []):
            custom.append({
                **item,
                "built_in": False,
                "token_configured": settings_store_for().has_secret(
                    owner_id, "mcp_servers", f"token:{item['id']}"
                ),
            })
        return {
            "builtin": {
                "id": "searxng",
                "name": "SearXNG Web Search",
                "transport": "stdio",
                "url": os.getenv("SEARXNG_URL", "http://127.0.0.1:8080"),
                "enabled": builtin_enabled,
                "built_in": True,
                "description": "Private web search and URL reading using the local SearXNG service.",
            },
            "servers": custom,
        }

    def mcp_servers_for(owner_id: str) -> list[MCPServerConfig]:
        configured = mcp_settings_for(owner_id)
        builtin = configured["builtin"]
        servers = [MCPServerConfig(
            id="searxng", name=builtin["name"], transport="stdio",
            builtin=True, enabled=builtin["enabled"],
        )]
        for item in configured["servers"]:
            servers.append(MCPServerConfig(
                id=item["id"], name=item["name"], transport=item["transport"],
                url=item["url"],
                token=settings_store_for().get_secret(
                    owner_id, "mcp_servers", f"token:{item['id']}"
                ),
                enabled=item["enabled"],
            ))
        return servers

    @app.get("/settings/agent-library")
    def get_agent_library(owner_id: str = Depends(current_owner)) -> dict[str, object]:
        return library_for(owner_id)

    @app.put("/settings/agent-library")
    def save_agent_library(body: LibrarySettingsRequest, owner_id: str = Depends(current_owner)) -> dict[str, object]:
        defaults = library_defaults()
        submitted = {kind: [item.model_dump() for item in getattr(body, kind)] for kind in ("skills", "personas")}
        for kind in ("skills", "personas"):
            default_ids = {item["id"] for item in defaults[kind]}
            seen: set[str] = set()
            for item in submitted[kind]:
                if item["id"] in seen:
                    raise HTTPException(status_code=422, detail="Item IDs must be unique.")
                seen.add(item["id"])
                if item["built_in"] != (item["id"] in default_ids):
                    raise HTTPException(status_code=422, detail="Built-in items cannot be added or removed.")
                if item["id"] in default_ids:
                    original = next(value for value in defaults[kind] if value["id"] == item["id"])
                    if any(item[key] != original[key] for key in ("name", "description", "content")):
                        raise HTTPException(status_code=422, detail="Built-in items cannot be edited.")
            if not default_ids.issubset(seen):
                raise HTTPException(status_code=422, detail="Built-in items cannot be deleted.")
            if len(seen) != len(submitted[kind]):
                raise HTTPException(status_code=422, detail="Item IDs must be unique.")
        settings_store_for().save(owner_id, "agent_library", schema_version=1, values=submitted)
        return library_for(owner_id)

    @app.get("/settings/mcp-servers")
    def get_mcp_settings(owner_id: str = Depends(current_owner)) -> dict[str, Any]:
        return mcp_settings_for(owner_id)

    @app.put("/settings/mcp-servers")
    def save_mcp_settings(body: MCPSettingsRequest, owner_id: str = Depends(current_owner)) -> dict[str, Any]:
        seen: set[str] = set()
        submitted: list[dict[str, Any]] = []
        secrets: dict[str, str] = {}
        clear_secrets: set[str] = set()
        old_record = settings_store_for().get(owner_id, "mcp_servers")
        old_servers = old_record["values"].get("servers", []) if old_record else []
        for item in body.servers:
            if item.id == "searxng" or item.built_in or item.id in seen:
                raise HTTPException(status_code=422, detail="Built-in IDs are reserved and custom IDs must be unique.")
            seen.add(item.id)
            submitted.append({
                "id": item.id, "name": item.name.strip(),
                "transport": item.transport, "url": item.url,
                "enabled": item.enabled, "built_in": False,
            })
            secret_name = f"token:{item.id}"
            if item.token:
                secrets[secret_name] = item.token
            elif item.clear_token:
                clear_secrets.add(secret_name)
        for previous in old_servers:
            if previous.get("id") not in seen:
                clear_secrets.add(f"token:{previous.get('id')}")
        try:
            settings_store_for().save(
                owner_id, "mcp_servers", schema_version=1,
                values={"builtin_enabled": body.builtin_enabled, "servers": submitted},
                secrets=secrets, clear_secrets=tuple(clear_secrets),
            )
        except RuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return mcp_settings_for(owner_id)

    @app.get("/settings/providers")
    def list_model_providers(
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        providers, active = model_provider_state(owner_id)
        return {
            "providers": [
                public_model_provider(owner_id, provider) for provider in providers
            ],
            "active_provider_id": active,
        }

    @app.post("/settings/providers", status_code=status.HTTP_201_CREATED)
    def create_model_provider(
        body: ModelProviderRequest,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        if body.clear_api_key:
            raise HTTPException(status_code=422, detail="There is no saved key to remove.")
        if len(model_provider_state(owner_id)[0]) >= 20:
            raise HTTPException(status_code=409, detail="You can save up to 20 providers.")
        try:
            base_url = _normalize_model_base_url(body.base_url)
            api_key = body.api_key.strip() if body.api_key and body.api_key.strip() else None
            catalog = discover_model_catalog(base_url, api_key)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except RuntimeError as error:
            raise HTTPException(
                status_code=502,
                detail="Could not connect to the selected model endpoint.",
            ) from error
        if body.model_id not in {item["id"] for item in catalog}:
            raise HTTPException(status_code=422, detail="Select a model from this provider.")
        providers, active = model_provider_state(owner_id)
        provider_id = uuid.uuid4().hex
        provider = {
            "id": provider_id,
            "name": body.name.strip(),
            "base_url": base_url,
            "model_id": body.model_id,
            "models": catalog,
            "reasoning_effort": body.reasoning_effort,
            "enabled": body.enabled,
            "model_controls": {
                body.model_id: [control.model_dump() for control in body.model_controls]
            },
            "model_control_selections": {},
        }
        control_ids = [control.id for control in body.model_controls]
        if len(control_ids) != len(set(control_ids)):
            raise HTTPException(status_code=422, detail="Control IDs must be unique.")
        if not provider["name"]:
            raise HTTPException(status_code=422, detail="Provider name cannot be empty.")
        providers.append(provider)
        if active is None and body.enabled:
            active = provider_id
        try:
            settings_store_for().save(
                owner_id,
                MODEL_PROVIDERS_NAMESPACE,
                schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
                values={"providers": providers},
                secrets=(
                    {f"api_key:{provider_id}": api_key}
                    if api_key
                    else None
                ),
            )
        except RuntimeError as error:
            raise HTTPException(
                status_code=503,
                detail="Provider keys cannot be saved until settings encryption is configured.",
            ) from error
        save_model_provider_state(owner_id, providers, active)
        return {
            "provider": public_model_provider(owner_id, provider),
            "active_provider_id": active,
            "models": catalog,
        }

    @app.put("/settings/providers/{provider_id}")
    def update_model_provider(
        provider_id: str,
        body: ModelProviderRequest,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        if body.clear_api_key and body.api_key and body.api_key.strip():
            raise HTTPException(
                status_code=422,
                detail="Enter a new API key or choose to remove the saved key, not both.",
            )
        providers, active = model_provider_state(owner_id)
        index = next(
            (i for i, item in enumerate(providers) if item.get("id") == provider_id),
            None,
        )
        if index is None:
            raise HTTPException(status_code=404, detail="Provider not found.")
        try:
            base_url = _normalize_model_base_url(body.base_url)
            api_key = body.api_key.strip() if body.api_key and body.api_key.strip() else None
            secret_name = f"api_key:{provider_id}"
            if api_key is None and not body.clear_api_key:
                api_key = settings_store_for().get_secret(
                    owner_id, MODEL_PROVIDERS_NAMESPACE, secret_name
                )
            catalog = discover_model_catalog(base_url, api_key)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except RuntimeError as error:
            raise HTTPException(status_code=502, detail="Could not connect to that provider.") from error
        if body.model_id not in {item["id"] for item in catalog}:
            raise HTTPException(status_code=422, detail="Select a model from this provider.")
        name = body.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Provider name cannot be empty.")
        provider = {
            **providers[index],
            "name": name,
            "base_url": base_url,
            "model_id": body.model_id,
            "models": catalog,
            "reasoning_effort": body.reasoning_effort,
            "enabled": body.enabled,
            "model_controls": {
                **providers[index].get("model_controls", {}),
                body.model_id: [control.model_dump() for control in body.model_controls],
            },
            "model_control_selections": providers[index].get(
                "model_control_selections", {}
            ),
        }
        control_ids = [control.id for control in body.model_controls]
        if len(control_ids) != len(set(control_ids)):
            raise HTTPException(status_code=422, detail="Control IDs must be unique.")
        providers[index] = provider
        if active == provider_id and not body.enabled:
            active = next(
                (item["id"] for item in providers if item.get("enabled")), None
            )
        elif active is None and body.enabled:
            active = provider_id
        try:
            save_model_provider_state(owner_id, providers, active)
            if api_key and body.api_key and body.api_key.strip():
                settings_store_for().save(
                    owner_id,
                    MODEL_PROVIDERS_NAMESPACE,
                    schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
                    values={"providers": providers},
                    secrets={secret_name: api_key},
                )
            elif body.clear_api_key:
                settings_store_for().save(
                    owner_id,
                    MODEL_PROVIDERS_NAMESPACE,
                    schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
                    values={"providers": providers},
                    clear_secrets=(secret_name,),
                )
        except RuntimeError as error:
            raise HTTPException(
                status_code=503,
                detail="Provider keys cannot be saved until settings encryption is configured.",
            ) from error
        return {
            "provider": public_model_provider(owner_id, provider),
            "active_provider_id": active,
            "models": catalog,
        }

    @app.patch("/settings/providers/active")
    def set_active_model_provider(
        body: ActiveModelProviderRequest,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        providers, _ = model_provider_state(owner_id)
        provider = next(
            (
                item
                for item in providers
                if item.get("id") == body.provider_id and item.get("enabled")
            ),
            None,
        )
        if provider is None:
            raise HTTPException(
                status_code=422,
                detail="Choose an enabled provider.",
            )
        save_model_provider_state(owner_id, providers, body.provider_id)
        return {"active_provider_id": body.provider_id}

    @app.patch("/settings/providers/{provider_id}/enabled")
    def set_model_provider_enabled(
        provider_id: str,
        body: ModelProviderEnabledRequest,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        providers, active = model_provider_state(owner_id)
        provider = next((item for item in providers if item.get("id") == provider_id), None)
        if provider is None:
            raise HTTPException(status_code=404, detail="Provider not found.")
        provider["enabled"] = body.enabled
        if body.enabled and active is None:
            active = provider_id
        elif not body.enabled and active == provider_id:
            active = next(
                (item["id"] for item in providers if item.get("enabled")), None
            )
        save_model_provider_state(owner_id, providers, active)
        return {"provider": public_model_provider(owner_id, provider), "active_provider_id": active}

    @app.delete("/settings/providers/{provider_id}")
    def delete_model_provider(
        provider_id: str,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        providers, active = model_provider_state(owner_id)
        remaining = [item for item in providers if item.get("id") != provider_id]
        if len(remaining) == len(providers):
            raise HTTPException(status_code=404, detail="Provider not found.")
        if active == provider_id:
            active = next(
                (item["id"] for item in remaining if item.get("enabled")), None
            )
        settings_store_for().save(
            owner_id,
            MODEL_PROVIDERS_NAMESPACE,
            schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
            values={"providers": remaining},
            clear_secrets=(f"api_key:{provider_id}",),
        )
        settings_store_for().save(
            owner_id,
            MODEL_SETTINGS_NAMESPACE,
            schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
            values={"active_provider_id": active},
        )
        return {"providers": remaining, "active_provider_id": active}

    @app.get("/settings/model")
    def get_model_settings(
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        _, provider = active_model_provider(owner_id)
        if provider is None:
            return {
                "configured": False,
                "base_url": "",
                "model_id": "",
                "reasoning_effort": "default",
                "api_key_configured": False,
                "active_provider_id": None,
                "model_controls": [],
                "model_control_selections": {},
            }
        return {
            "configured": True,
            "base_url": provider["base_url"],
            "model_id": provider["model_id"],
            "reasoning_effort": provider.get("reasoning_effort", "default"),
            "model_controls": provider.get("model_controls", {}).get(
                provider["model_id"], []
            ),
            "model_control_selections": provider.get(
                "model_control_selections", {}
            ).get(provider["model_id"], {}),
            "api_key_configured": settings_store_for().has_secret(
                owner_id,
                MODEL_PROVIDERS_NAMESPACE,
                f"api_key:{provider['id']}",
            ),
            "active_provider_id": provider["id"],
        }

    @app.post("/settings/model/discover")
    def discover_user_models(
        body: ModelSettingsDiscoveryRequest,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        try:
            base_url = _normalize_model_base_url(body.base_url)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        api_key = body.api_key or None
        if api_key is None:
            providers, _ = model_provider_state(owner_id)
            existing = next(
                (
                    item
                    for item in providers
                    if (
                        item.get("id") == body.provider_id
                        if body.provider_id
                        else item.get("base_url") == base_url
                    )
                ),
                None,
            )
            if existing:
                api_key = settings_store_for().get_secret(
                    owner_id,
                    MODEL_PROVIDERS_NAMESPACE,
                    f"api_key:{existing['id']}",
                )
        try:
            return {"models": discover_model_catalog(base_url, api_key)}
        except RuntimeError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not discover models from that endpoint.",
            ) from error

    @app.put("/settings/model")
    def save_model_settings(
        body: ModelSettingsSaveRequest,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        if body.clear_api_key and body.api_key and body.api_key.strip():
            raise HTTPException(
                status_code=422,
                detail="Enter a new API key or choose to remove the saved key, not both.",
            )
        try:
            base_url = _normalize_model_base_url(body.base_url)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

        store_for_settings = settings_store_for()
        api_key = body.api_key.strip() if body.api_key and body.api_key.strip() else None
        if api_key is None and not body.clear_api_key:
            providers, active = active_model_provider(owner_id)
            active_secret = (
                f"api_key:{active['id']}" if active is not None else None
            )
            api_key = (
                store_for_settings.get_secret(
                    owner_id, MODEL_PROVIDERS_NAMESPACE, active_secret
                )
                if active_secret
                else None
            )
        try:
            catalog = discover_model_catalog(base_url, api_key)
        except RuntimeError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not connect to the selected model endpoint.",
            ) from error

        model_id = body.model_id or (catalog[0]["id"] if catalog else "")
        if model_id not in {item["id"] for item in catalog}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The selected model is not available at this endpoint.",
            )
        providers, active = model_provider_state(owner_id)
        provider = next(
            (item for item in providers if item.get("id") == active), None
        )
        if provider is None:
            provider_id = uuid.uuid4().hex
            parsed_url = urlsplit(base_url)
            provider = {
                "id": provider_id,
                "name": parsed_url.hostname or "OpenAI-compatible API",
                "enabled": True,
            }
            providers.append(provider)
            active = provider_id
        provider.update(
            {
                "base_url": base_url,
                "model_id": model_id,
                "reasoning_effort": body.reasoning_effort,
                "enabled": True,
            }
        )
        secret_name = f"api_key:{provider['id']}"
        try:
            store_for_settings.save(
                owner_id,
                MODEL_PROVIDERS_NAMESPACE,
                schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
                values={"providers": providers},
                secrets=({secret_name: api_key} if body.api_key and api_key else None),
                clear_secrets=(secret_name,) if body.clear_api_key else (),
            )
            store_for_settings.save(
                owner_id,
                MODEL_SETTINGS_NAMESPACE,
                schema_version=MODEL_SETTINGS_SCHEMA_VERSION,
                values={"active_provider_id": active},
            )
        except RuntimeError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Provider keys cannot be saved until settings encryption is configured.",
            ) from error
        return {
            "configured": True,
            "base_url": base_url,
            "model_id": model_id,
            "reasoning_effort": body.reasoning_effort,
            "api_key_configured": bool(api_key and not body.clear_api_key),
            "active_provider_id": active,
            "models": catalog,
        }

    @app.patch("/settings/model/selection")
    def save_model_selection(
        body: ModelSettingsSelectionRequest,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        store_for_settings = settings_store_for()
        providers, provider = active_model_provider(owner_id)
        if provider is None:
            raise HTTPException(status_code=409, detail="Configure a model endpoint first.")
        known_models = provider.get("models", [])
        allowed_model_ids = {
            item["id"] for item in known_models
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        if not allowed_model_ids:
            allowed_model_ids = {provider["model_id"]}
        if body.model_id not in allowed_model_ids:
            raise HTTPException(
                status_code=422,
                detail="The selected model is not available at this endpoint.",
            )
        provider["model_id"] = body.model_id
        provider["reasoning_effort"] = body.reasoning_effort
        save_model_provider_state(owner_id, providers, provider["id"])
        return {"model_id": body.model_id, "reasoning_effort": body.reasoning_effort}

    @app.patch("/settings/model/controls")
    def save_model_control_selection(
        body: ModelControlSelectionRequest,
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        providers, provider = active_model_provider(owner_id)
        if provider is None:
            raise HTTPException(status_code=409, detail="Enable a model provider first.")
        controls = provider.get("model_controls", {}).get(body.model_id, [])
        control = next(
            (item for item in controls if item.get("id") == body.control_id), None
        )
        if control is None:
            raise HTTPException(status_code=404, detail="Model control not found.")
        allowed_values = {item.get("value") for item in control.get("options", [])}
        if body.value is not None and body.value not in allowed_values:
            raise HTTPException(status_code=422, detail="That option is not available for this model.")
        selections_by_model = provider.setdefault("model_control_selections", {})
        model_selections = selections_by_model.setdefault(body.model_id, {})
        if body.value is None:
            model_selections.pop(body.control_id, None)
        else:
            model_selections[body.control_id] = body.value
        save_model_provider_state(owner_id, providers, provider["id"])
        return {"model_id": body.model_id, "selections": model_selections}

    @app.get("/models")
    def available_models(
        owner_id: str = Depends(current_owner),
    ) -> dict[str, object]:
        _, provider = active_model_provider(owner_id)
        if provider is None:
            raise HTTPException(status_code=409, detail="Configure a model endpoint first.")
        api_key = settings_store_for().get_secret(
            owner_id,
            MODEL_PROVIDERS_NAMESPACE,
            f"api_key:{provider['id']}",
        )
        try:
            catalog = discover_model_catalog(provider["base_url"], api_key)
        except RuntimeError as error:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not discover models from your configured endpoint.",
            ) from error
        return {"models": catalog, "selected_model": provider["model_id"]}

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

    @app.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
    def delete_all_sessions(
        owner_id: str = Depends(current_owner),
    ) -> Response:
        try:
            sessions_for(owner_id).delete_all_sessions()
        except SessionBusy as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return Response(status_code=status.HTTP_204_NO_CONTENT)

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

    @app.patch("/sessions/{session_id}", response_model=SessionResponse)
    def rename_session(
        session_id: str,
        payload: RenameSessionRequest,
        owner_id: str = Depends(current_owner),
    ) -> SessionResponse:
        try:
            return _session_response(
                sessions_for(owner_id).rename_session(session_id, payload.title)
            )
        except SessionNotFound as error:
            raise HTTPException(status_code=404, detail="Session not found.") from error

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
        request: Request,
        owner_id: str = Depends(current_owner),
        idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ) -> MessageResponse:
        enforce_message_rate_limit(owner_id)
        manager = sessions_for(owner_id)
        provider_params: dict[str, Any] = {}
        try:
            if app.state.model is not None:
                model = app.state.model
                reasoning_effort = body.reasoning_effort
                if reasoning_effort == "default":
                    reasoning_effort = None
            else:
                _, provider = active_model_provider(owner_id)
                if provider is None:
                    raise HTTPException(
                        status_code=409,
                        detail="Enable a model provider in Settings before chatting.",
                    )
                api_key = settings_store_for().get_secret(
                    owner_id,
                    MODEL_PROVIDERS_NAMESPACE,
                    f"api_key:{provider['id']}",
                )
                model_id = body.model_id or provider["model_id"]
                known_models = provider.get("models", [])
                allowed_model_ids = {
                    item["id"] for item in known_models
                    if isinstance(item, dict) and isinstance(item.get("id"), str)
                }
                if not allowed_model_ids:
                    allowed_model_ids = {provider["model_id"]}
                if model_id not in allowed_model_ids:
                    raise HTTPException(
                        status_code=422,
                        detail="The selected model is not available at your endpoint.",
                    )
                model = create_compatible_model(
                    base_url=provider["base_url"],
                    api_key=api_key,
                    model_id=model_id,
                )
                model_controls = provider.get("model_controls", {}).get(model_id, [])
                configured_control_ids = {control.get("id") for control in model_controls}
                unknown_controls = set(body.model_controls) - configured_control_ids
                if unknown_controls:
                    raise HTTPException(
                        status_code=422,
                        detail="One or more controls are not configured for this model.",
                    )
                saved_selections = provider.get("model_control_selections", {}).get(
                    model_id, {}
                )
                has_reasoning_control = False
                reasoning_effort = None
                for control in model_controls:
                    control_id = control["id"]
                    parameter = control["parameter"]
                    has_reasoning_control |= parameter == "reasoning_effort"
                    if control_id in body.model_controls:
                        selected_value = body.model_controls[control_id]
                        if selected_value is None:
                            selected_value = control.get("default_value")
                    else:
                        selected_value = saved_selections.get(
                            control_id, control.get("default_value")
                        )
                    if selected_value is None:
                        options = control.get("options", [])
                        selected_value = options[0].get("value") if options else None
                    allowed_values = {
                        option["value"] for option in control.get("options", [])
                    }
                    if selected_value is not None and selected_value not in allowed_values:
                        raise HTTPException(
                            status_code=422,
                            detail=f"The selected value for {control.get('name', control_id)} is not available.",
                        )
                    if selected_value is None:
                        continue
                    if parameter == "reasoning_effort":
                        reasoning_effort = selected_value
                    else:
                        provider_params[parameter] = selected_value
                if not has_reasoning_control:
                    reasoning_effort = body.reasoning_effort
                    if reasoning_effort is None:
                        reasoning_effort = provider.get("reasoning_effort", "default")
                if reasoning_effort == "default":
                    reasoning_effort = None
            prior_event_count = len(manager.audit_events(session_id))
            accept = request.headers.get("accept", "").lower()
            use_sse = "text/event-stream" in accept
            use_ndjson = "application/x-ndjson" in accept
            if use_sse or use_ndjson:
                async def stream_turn():
                    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

                    def on_event(event: ai.events.AgentEvent) -> None:
                        if isinstance(event, ai.events.TextDelta):
                            queue.put_nowait({"type": "text_delta", "delta": event.chunk})
                        elif isinstance(event, ai.events.ToolStart):
                            activity = next(
                                (item for item in _tool_activities(manager.audit_events(session_id)[prior_event_count:])
                                 if item.tool_call_id == event.tool_call_id),
                                ToolActivity(tool_call_id=event.tool_call_id, tool_name=event.tool_name, status="running"),
                            )
                            queue.put_nowait({"type": "tool_activity", "activity": activity.model_dump()})
                        elif isinstance(event, ai.events.ToolCallResult):
                            activities = _tool_activities(manager.audit_events(session_id)[prior_event_count:])
                            for result in event.results:
                                activity = next((item for item in activities if item.tool_call_id == result.tool_call_id), None)
                                if activity is not None:
                                    queue.put_nowait({"type": "tool_activity", "activity": activity.model_dump()})

                    async def run_turn() -> None:
                        try:
                            answer = await manager.run_turn(
                                session_id,
                                body.content,
                                model,
                                request_id=idempotency_key,
                                reasoning_effort=reasoning_effort,
                                provider_params=provider_params,
                                system_instruction=OPENUI_SYSTEM_PROMPT,
                                on_event=on_event,
                            )
                            queue.put_nowait({
                                "type": "complete",
                                "response": answer,
                                "tool_events": [
                                    item.model_dump()
                                    for item in _tool_activities(manager.audit_events(session_id)[prior_event_count:])
                                ],
                            })
                        except SessionNotFound:
                            queue.put_nowait({"type": "error", "detail": "Session not found."})
                        except SessionBusy:
                            queue.put_nowait({"type": "error", "detail": "Session is busy."})
                        except (ValueError, RuntimeError) as error:
                            queue.put_nowait({"type": "error", "detail": str(error)})
                        except Exception:
                            logger.exception("Streaming agent turn failed", extra={"session_id": session_id})
                            queue.put_nowait({"type": "error", "detail": "Agent request failed."})
                        finally:
                            queue.put_nowait(None)

                    task = asyncio.create_task(run_turn())
                    try:
                        while True:
                            try:
                                item = await asyncio.wait_for(
                                    queue.get(), timeout=15 if use_sse else None
                                )
                            except asyncio.TimeoutError:
                                yield ": keep-alive\n\n"
                                continue
                            if item is None:
                                break
                            payload = json.dumps(item, ensure_ascii=False)
                            if use_sse:
                                yield f"data: {payload}\n\n"
                            else:
                                yield payload + "\n"
                    finally:
                        if not task.done():
                            task.cancel()

                return StreamingResponse(
                    stream_turn(),
                    media_type="text/event-stream" if use_sse else "application/x-ndjson",
                    headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
                )
            answer = await manager.run_turn(
                session_id,
                body.content,
                model,
                request_id=idempotency_key,
                reasoning_effort=reasoning_effort,
                provider_params=provider_params,
                system_instruction=OPENUI_SYSTEM_PROMPT,
            )
        except HTTPException:
            raise
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
        audit_events = manager.audit_events(session_id)[prior_event_count:]
        return MessageResponse(
            session_id=session_id,
            response=answer,
            tool_events=_tool_activities(audit_events),
        )

    @app.get(
        "/sessions/{session_id}/messages",
        response_model=SessionHistoryResponse,
    )
    def get_messages(
        session_id: str,
        owner_id: str = Depends(current_owner),
    ) -> SessionHistoryResponse:
        manager = sessions_for(owner_id)
        try:
            state = manager.load_session(session_id)
        except SessionNotFound as error:
            raise HTTPException(status_code=404, detail="Session not found.") from error
        except SessionBusy as error:
            raise HTTPException(status_code=409, detail="Session is busy.") from error
        messages = [
            HistoryMessage(index=index, role=message.role, content=message.text)
            for index, message in enumerate(state.messages)
            if message.role in {"user", "assistant"} and message.text
        ]
        assistant_indexes_by_hash: dict[str, list[int]] = {}
        for index, message in enumerate(messages):
            if message.role == "assistant":
                digest = hashlib.sha256(message.content.encode("utf-8")).hexdigest()
                assistant_indexes_by_hash.setdefault(digest, []).append(index)

        events_by_turn: dict[str, list[dict[str, Any]]] = {}
        for event in manager.audit_events(session_id):
            turn_id = event.get("turn_id")
            if isinstance(turn_id, str):
                events_by_turn.setdefault(turn_id, []).append(event)

        for events in events_by_turn.values():
            completed = next(
                (
                    event.get("payload", {})
                    for event in events
                    if event.get("event_type") == "turn_completed"
                ),
                {},
            )
            digest = completed.get("assistant_text_sha256")
            if not isinstance(digest, str):
                continue
            matching_indexes = assistant_indexes_by_hash.get(digest)
            if not matching_indexes:
                continue
            message_index = matching_indexes.pop(0)
            messages[message_index].tool_events = _tool_activities(events)
        return SessionHistoryResponse(session_id=session_id, messages=messages)

    return app


app = create_app()


def main() -> None:
    uvicorn.run(
        "myagent.api:app",
        host=os.getenv("MYAGENT_API_HOST", "127.0.0.1"),
        port=int(os.getenv("MYAGENT_API_PORT", "5000")),
    )
