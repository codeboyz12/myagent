"""Coordinate the AI SDK agent with durable session storage."""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import ai
from ai.models import InferenceRequestParams
from ai.types.messages import Message

from myagent.sessions.store import (
    DuplicateRequest,
    SQLiteSessionStore,
    SessionBusy,
    SessionSummary,
)
from myagent.tools import ToolContext, get_agent_tools

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SessionState:
    summary: SessionSummary
    messages: list[Message]


def _json_value(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _redact(value: Any) -> Any:
    sensitive = ("api_key", "apikey", "token", "secret", "password", "authorization")
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if any(part in key.lower() for part in sensitive)
            else _redact(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def _message_dump(messages: list[Message]) -> list[dict[str, Any]]:
    return [message.model_dump(mode="json", exclude_none=True) for message in messages]


def _tool_arguments(message: Any, tool_call_id: str) -> dict[str, Any]:
    for part in getattr(message, "parts", []):
        if getattr(part, "tool_call_id", None) != tool_call_id:
            continue
        raw_arguments = getattr(part, "tool_args", "")
        try:
            decoded = json.loads(raw_arguments or "{}")
        except (TypeError, json.JSONDecodeError):
            return {"unparsed": True}
        return _redact(decoded) if isinstance(decoded, dict) else {"value": _redact(decoded)}
    return {}


class SessionManager:
    """Own session history, turn lifecycle, and session-bound tool scope."""

    def __init__(
        self,
        store: SQLiteSessionStore,
        *,
        owner_id: str,
        data_dir: str | Path,
        workspace_root: str | Path,
        persona_root: str | Path | None = None,
        agent_factory: Callable[[ToolContext], Any] | None = None,
        session_scoped_context: bool = False,
    ) -> None:
        self.store = store
        self.owner_id = owner_id
        self.data_dir = Path(data_dir).expanduser().resolve()
        self.workspace_root = Path(workspace_root).expanduser().resolve()
        self._persona_root = (
            Path(persona_root).expanduser().resolve()
            if persona_root is not None
            else None
        )
        self._agent_factory = agent_factory or self._build_agent
        self._session_scoped_context = session_scoped_context

    @staticmethod
    def _build_agent(context: ToolContext) -> ai.Agent:
        return ai.Agent(tools=get_agent_tools(context))

    @property
    def persona_dir(self) -> Path:
        # Preserve the original local user's profile location. Explicit owners
        # receive separate directories derived from a non-reversible key.
        if self._persona_root is not None:
            return self._persona_root
        if self.owner_id == "local-user":
            return Path(__file__).resolve().parents[3] / "data" / "personas"
        owner_key = hashlib.sha256(self.owner_id.encode("utf-8")).hexdigest()[:24]
        return self.data_dir / "personas" / owner_key

    def create_session(self, initial_messages: list[Message]) -> SessionSummary:
        summary = self.store.create_session(
            self.owner_id,
            _message_dump(initial_messages),
        )
        logger.info(
            "Session created",
            extra={"event": "session_created", "owner_id": self.owner_id, "session_id": summary.id},
        )
        return summary

    def list_sessions(self) -> list[SessionSummary]:
        return self.store.list_sessions(self.owner_id)

    def rename_session(self, session_id: str, title: str) -> SessionSummary:
        return self.store.rename_session(self.owner_id, session_id, title)

    def delete_session(self, session_id: str) -> None:
        self.store.delete_session(self.owner_id, session_id)
        if self._session_scoped_context:
            session_scope = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:24]
            for root in (self.workspace_root, self.persona_dir):
                scoped_path = root.resolve() / session_scope
                if scoped_path.is_symlink():
                    scoped_path.unlink()
                elif scoped_path.is_dir():
                    shutil.rmtree(scoped_path)
                elif scoped_path.exists():
                    scoped_path.unlink()
        logger.info(
            "Session deleted",
            extra={"event": "session_deleted", "owner_id": self.owner_id, "session_id": session_id},
        )

    def audit_events(self, session_id: str) -> list[dict[str, Any]]:
        return self.store.list_audit_events(self.owner_id, session_id)

    def load_session(self, session_id: str) -> SessionState:
        summary = self.store.get_session(self.owner_id, session_id)
        messages = [
            Message.model_validate(data)
            for data in self.store.load_messages(self.owner_id, session_id)
        ]
        return SessionState(summary, messages)

    async def run_turn(
        self,
        session_id: str,
        user_text: str,
        model: ai.Model,
        *,
        fallback_model: ai.Model | None = None,
        request_id: str | None = None,
        reasoning_effort: str | None = None,
        provider_params: Mapping[str, Any] | None = None,
        on_event: Callable[[ai.events.AgentEvent], None] | None = None,
    ) -> str:
        state = self.load_session(session_id)
        try:
            turn_id = self.store.begin_turn(
                self.owner_id,
                session_id,
                user_text=user_text,
                model_id=model.id,
                request_id=request_id,
            )
        except DuplicateRequest as duplicate:
            if duplicate.status == "completed":
                return duplicate.assistant_text or ""
            if duplicate.status == "running":
                raise SessionBusy(str(duplicate)) from duplicate
            raise RuntimeError(
                f"Request already ended as {duplicate.status}; use a new request ID to retry."
            ) from duplicate
        logger.info(
            "Session turn started",
            extra={
                "event": "turn_started",
                "owner_id": self.owner_id,
                "session_id": session_id,
                "turn_id": turn_id,
                "model_id": model.id,
            },
        )
        messages = [*state.messages, ai.user_message(user_text)]
        session_scope = (
            hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:24]
            if self._session_scoped_context
            else None
        )
        context = ToolContext(
            workspace_root=(self.workspace_root / session_scope)
            if session_scope
            else self.workspace_root,
            persona_dir=(self.persona_dir / session_scope)
            if session_scope
            else self.persona_dir,
        )

        try:
            params = (
                InferenceRequestParams(extra_body=dict(provider_params))
                if provider_params
                else None
            )
            if reasoning_effort is not None:
                params = (params or InferenceRequestParams()).with_reasoning_effort(
                    reasoning_effort
                )
            provider_activity_seen = False

            async def run_with(
                selected_model: ai.Model,
            ) -> tuple[list[Message], str]:
                nonlocal provider_activity_seen
                agent = self._agent_factory(context)
                tool_argument_chunks: dict[str, str] = {}
                run = (
                    agent.run(selected_model, messages, params=params)
                    if params is not None
                    else agent.run(selected_model, messages)
                )
                async with run as stream:
                    async for event in stream:
                        if isinstance(
                            event,
                            (
                                ai.events.TextDelta,
                                ai.events.ReasoningDelta,
                                ai.events.ToolStart,
                                ai.events.ToolDelta,
                                ai.events.ToolCallResult,
                            ),
                        ):
                            provider_activity_seen = True
                        self._record_agent_event(
                            session_id, turn_id, event, tool_argument_chunks
                        )
                        if isinstance(event, ai.events.TextDelta):
                            self.store.append_partial_text(turn_id, event.chunk)
                        if on_event is not None:
                            on_event(event)

                    return stream.messages, str(stream.output)

            try:
                final_messages, assistant_text = await run_with(model)
            except Exception:
                if fallback_model is None or provider_activity_seen:
                    raise
                logger.warning(
                    "Primary model failed before producing output; trying fallback",
                    extra={
                        "event": "model_fallback",
                        "session_id": session_id,
                        "turn_id": turn_id,
                        "primary_model_id": model.id,
                        "fallback_model_id": fallback_model.id,
                    },
                )
                self.store.record_event(
                    self.owner_id,
                    session_id,
                    turn_id,
                    "model_fallback",
                    {
                        "primary_model_id": model.id,
                        "fallback_model_id": fallback_model.id,
                    },
                )
                final_messages, assistant_text = await run_with(fallback_model)

            self.store.complete_turn(
                self.owner_id,
                session_id,
                turn_id,
                messages=_message_dump(final_messages),
                assistant_text=assistant_text,
            )
            logger.info(
                "Session turn completed",
                extra={
                    "event": "turn_completed",
                    "owner_id": self.owner_id,
                    "session_id": session_id,
                    "turn_id": turn_id,
                },
            )
            return assistant_text
        except Exception as error:
            self.store.fail_turn(
                self.owner_id,
                session_id,
                turn_id,
                error=f"{type(error).__name__}: {error}",
            )
            logger.error(
                "Session turn failed",
                extra={
                    "event": "turn_failed",
                    "owner_id": self.owner_id,
                    "session_id": session_id,
                    "turn_id": turn_id,
                },
            )
            raise
        except BaseException as error:
            self.store.fail_turn(
                self.owner_id,
                session_id,
                turn_id,
                error=f"{type(error).__name__}: {error}",
                interrupted=True,
            )
            raise

    def _record_agent_event(
        self,
        session_id: str,
        turn_id: str,
        event: ai.events.AgentEvent,
        tool_argument_chunks: dict[str, str],
    ) -> None:
        if isinstance(event, ai.events.ToolDelta):
            tool_argument_chunks[event.tool_call_id] = (
                tool_argument_chunks.get(event.tool_call_id, "") + event.chunk
            )
        elif isinstance(event, ai.events.ToolStart):
            self.store.record_event(
                self.owner_id,
                session_id,
                turn_id,
                "tool_started",
                {
                    "tool_call_id": event.tool_call_id,
                    "tool_name": event.tool_name,
                    "arguments": _tool_arguments(event.message, event.tool_call_id),
                },
            )
        elif isinstance(event, ai.events.ToolCallResult):
            for result in event.results:
                raw_arguments = tool_argument_chunks.pop(result.tool_call_id, "")
                try:
                    decoded_arguments = json.loads(raw_arguments or "{}")
                except json.JSONDecodeError:
                    decoded_arguments = {}
                arguments = (
                    _redact(decoded_arguments)
                    if isinstance(decoded_arguments, dict)
                    else {}
                )
                encoded_result = json.dumps(
                    _json_value(result.result),
                    ensure_ascii=False,
                    sort_keys=True,
                ).encode("utf-8")
                self.store.record_event(
                    self.owner_id,
                    session_id,
                    turn_id,
                    "tool_completed",
                    {
                        "tool_call_id": result.tool_call_id,
                        "tool_name": result.tool_name,
                        "is_error": result.is_error,
                        "arguments": arguments,
                        "result_sha256": hashlib.sha256(encoded_result).hexdigest(),
                        "result_bytes": len(encoded_result),
                    },
                )
