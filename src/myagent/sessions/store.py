"""SQLite persistence for sessions, turns, message snapshots, and audit events."""

from __future__ import annotations

import json
import hashlib
import os
import re
import sqlite3
import uuid
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


_SENSITIVE_ERROR = re.compile(
    r"(?i)\b(api[_-]?key|token|secret|password|authorization)\b"
    r"(\s*[:=]\s*)([^\s,;&]+)"
)
_BEARER_VALUE = re.compile(r"(?i)\bBearer\s+[^\s,;&]+")


class SessionNotFound(LookupError):
    """The session does not exist for the supplied owner."""


class SessionBusy(RuntimeError):
    """Another live process is already running a turn for this session."""


class DuplicateRequest(RuntimeError):
    """A request ID was already used for this session."""

    def __init__(self, turn_id: str, status: str, assistant_text: str | None) -> None:
        super().__init__(f"Request already exists as turn {turn_id} ({status}).")
        self.turn_id = turn_id
        self.status = status
        self.assistant_text = assistant_text


@dataclass(frozen=True)
class SessionSummary:
    id: str
    created_at: str
    updated_at: str
    last_turn_status: str | None


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _safe_error(error: str) -> str:
    return _BEARER_VALUE.sub(
        "Bearer [REDACTED]",
        _SENSITIVE_ERROR.sub(r"\1\2[REDACTED]", error),
    )[:1000]


def _process_is_running(process_id: int | None) -> bool:
    if not process_id:
        return False
    try:
        os.kill(process_id, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


class SQLiteSessionStore:
    """Persist a session history and its auditable turn lifecycle."""

    def __init__(
        self,
        path: str | Path,
        *,
        process_is_running: Callable[[int | None], bool] = _process_is_running,
    ) -> None:
        self.path = Path(path).expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            descriptor = os.open(
                self.path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
                0o600,
            )
        except FileExistsError:
            pass
        else:
            os.close(descriptor)
        os.chmod(self.path, 0o600)
        self._process_is_running = process_is_running
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.execute("PRAGMA synchronous = FULL")
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            yield connection
        finally:
            connection.close()

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS sessions_owner_updated
                    ON sessions(owner_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS messages (
                    session_id TEXT NOT NULL REFERENCES sessions(id),
                    position INTEGER NOT NULL,
                    body_json TEXT NOT NULL,
                    PRIMARY KEY(session_id, position)
                );

                CREATE TABLE IF NOT EXISTS turns (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL REFERENCES sessions(id),
                    status TEXT NOT NULL CHECK (
                        status IN ('running', 'completed', 'failed', 'interrupted')
                    ),
                    request_id TEXT NOT NULL,
                    model_id TEXT NOT NULL,
                    user_text TEXT NOT NULL,
                    partial_text TEXT NOT NULL DEFAULT '',
                    assistant_text TEXT,
                    error TEXT,
                    process_id INTEGER,
                    started_at TEXT NOT NULL,
                    finished_at TEXT
                );

                CREATE UNIQUE INDEX IF NOT EXISTS turns_session_request
                    ON turns(session_id, request_id);

                CREATE INDEX IF NOT EXISTS turns_session_started
                    ON turns(session_id, started_at DESC);

                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL REFERENCES sessions(id),
                    turn_id TEXT REFERENCES turns(id),
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    occurred_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS audit_events_session
                    ON audit_events(session_id, id);
                """
            )

    def create_session(
        self,
        owner_id: str,
        initial_messages: Sequence[dict[str, Any]],
    ) -> SessionSummary:
        session_id = str(uuid.uuid4())
        timestamp = _now()
        with self._transaction() as connection:
            connection.execute(
                "INSERT INTO sessions(id, owner_id, created_at, updated_at) "
                "VALUES (?, ?, ?, ?)",
                (session_id, owner_id, timestamp, timestamp),
            )
            self._replace_messages(connection, session_id, initial_messages)
            self._append_event(
                connection,
                session_id,
                None,
                "session_created",
                {
                    "initial_messages_sha256": hashlib.sha256(
                        _encode(initial_messages).encode("utf-8")
                    ).hexdigest(),
                },
                timestamp,
            )
        return SessionSummary(session_id, timestamp, timestamp, None)

    def list_sessions(self, owner_id: str) -> list[SessionSummary]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT s.id, s.created_at, s.updated_at,
                       (SELECT t.status FROM turns t
                        WHERE t.session_id = s.id
                        ORDER BY t.started_at DESC, t.rowid DESC LIMIT 1) AS last_turn_status
                FROM sessions s
                WHERE s.owner_id = ?
                ORDER BY s.updated_at DESC
                """,
                (owner_id,),
            ).fetchall()
        return [
            SessionSummary(
                row["id"], row["created_at"], row["updated_at"],
                row["last_turn_status"],
            )
            for row in rows
        ]

    def delete_session(self, owner_id: str, session_id: str) -> None:
        with self._transaction() as connection:
            self._require_owned_session(connection, owner_id, session_id)
            self._recover_stale_turns(connection, session_id)
            active = connection.execute(
                "SELECT id FROM turns WHERE session_id = ? AND status = 'running'",
                (session_id,),
            ).fetchone()
            if active:
                raise SessionBusy(f"Session {session_id} has a running turn.")
            connection.execute(
                "DELETE FROM audit_events WHERE session_id = ?", (session_id,)
            )
            connection.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            connection.execute("DELETE FROM turns WHERE session_id = ?", (session_id,))
            connection.execute("DELETE FROM sessions WHERE id = ?", (session_id,))

    def clear_all_sessions(self) -> int:
        """Delete all session data, refusing to interrupt a live turn."""
        with self._transaction() as connection:
            session_ids = [
                row["id"]
                for row in connection.execute("SELECT id FROM sessions").fetchall()
            ]
            for session_id in session_ids:
                self._recover_stale_turns(connection, session_id)
            active = connection.execute(
                "SELECT id FROM turns WHERE status = 'running' LIMIT 1"
            ).fetchone()
            if active:
                raise SessionBusy("Cannot clear session data while a turn is running.")

            connection.execute("DELETE FROM audit_events")
            connection.execute("DELETE FROM messages")
            connection.execute("DELETE FROM turns")
            connection.execute("DELETE FROM sessions")
        return len(session_ids)

    def get_session(self, owner_id: str, session_id: str) -> SessionSummary:
        with self._transaction() as connection:
            self._require_owned_session(connection, owner_id, session_id)
            self._recover_stale_turns(connection, session_id)
            row = connection.execute(
                """
                SELECT s.id, s.created_at, s.updated_at,
                       (SELECT t.status FROM turns t
                        WHERE t.session_id = s.id
                        ORDER BY t.started_at DESC, t.rowid DESC LIMIT 1) AS last_turn_status
                FROM sessions s WHERE s.id = ? AND s.owner_id = ?
                """,
                (session_id, owner_id),
            ).fetchone()
        return SessionSummary(
            row["id"], row["created_at"], row["updated_at"],
            row["last_turn_status"],
        )

    def load_messages(
        self,
        owner_id: str,
        session_id: str,
    ) -> list[dict[str, Any]]:
        with self._connection() as connection:
            self._require_owned_session(connection, owner_id, session_id)
            rows = connection.execute(
                "SELECT body_json FROM messages WHERE session_id = ? "
                "ORDER BY position",
                (session_id,),
            ).fetchall()
        return [json.loads(row["body_json"]) for row in rows]

    def begin_turn(
        self,
        owner_id: str,
        session_id: str,
        *,
        user_text: str,
        model_id: str,
        request_id: str | None = None,
        process_id: int | None = None,
    ) -> str:
        turn_id = str(uuid.uuid4())
        request_id = request_id or str(uuid.uuid4())
        timestamp = _now()
        with self._transaction() as connection:
            self._require_owned_session(connection, owner_id, session_id)
            self._recover_stale_turns(connection, session_id)
            existing = connection.execute(
                """SELECT id, status, user_text, model_id, assistant_text
                   FROM turns WHERE session_id = ? AND request_id = ?""",
                (session_id, request_id),
            ).fetchone()
            if existing:
                if (
                    existing["user_text"] != user_text
                    or existing["model_id"] != model_id
                ):
                    raise ValueError("Request ID was reused with different input.")
                raise DuplicateRequest(
                    existing["id"], existing["status"], existing["assistant_text"]
                )
            active = connection.execute(
                "SELECT id FROM turns WHERE session_id = ? AND status = 'running'",
                (session_id,),
            ).fetchone()
            if active:
                raise SessionBusy(f"Session {session_id} already has a running turn.")

            connection.execute(
                """INSERT INTO turns(
                    id, session_id, status, request_id, model_id, user_text,
                    process_id, started_at
                ) VALUES (?, ?, 'running', ?, ?, ?, ?, ?)""",
                (
                    turn_id,
                    session_id,
                    request_id,
                    model_id,
                    user_text,
                    process_id or os.getpid(),
                    timestamp,
                ),
            )
            self._append_event(
                connection,
                session_id,
                turn_id,
                "turn_started",
                {
                    "model_id": model_id,
                    "request_id": request_id,
                    "user_text": user_text,
                },
                timestamp,
            )
            connection.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (timestamp, session_id),
            )
        return turn_id

    def append_partial_text(self, turn_id: str, chunk: str) -> None:
        with self._transaction() as connection:
            row = self._require_running_turn(connection, turn_id)
            connection.execute(
                "UPDATE turns SET partial_text = partial_text || ? WHERE id = ?",
                (chunk, turn_id),
            )
            self._append_event(
                connection,
                row["session_id"],
                turn_id,
                "assistant_text_delta",
                {"text": chunk},
                _now(),
            )

    def record_event(
        self,
        owner_id: str,
        session_id: str,
        turn_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        with self._transaction() as connection:
            self._require_owned_session(connection, owner_id, session_id)
            turn = self._require_running_turn(connection, turn_id)
            if turn["session_id"] != session_id:
                raise SessionNotFound(session_id)
            self._append_event(
                connection, session_id, turn_id, event_type, payload, _now()
            )

    def complete_turn(
        self,
        owner_id: str,
        session_id: str,
        turn_id: str,
        *,
        messages: Sequence[dict[str, Any]],
        assistant_text: str,
    ) -> None:
        timestamp = _now()
        with self._transaction() as connection:
            self._require_owned_session(connection, owner_id, session_id)
            turn = self._require_running_turn(connection, turn_id)
            if turn["session_id"] != session_id:
                raise SessionNotFound(session_id)
            self._replace_messages(connection, session_id, messages)
            connection.execute(
                """UPDATE turns SET status = 'completed', assistant_text = ?,
                   partial_text = ?, finished_at = ? WHERE id = ?""",
                (assistant_text, assistant_text, timestamp, turn_id),
            )
            connection.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (timestamp, session_id),
            )
            self._append_event(
                connection,
                session_id,
                turn_id,
                "turn_completed",
                {
                    "assistant_text_sha256": hashlib.sha256(
                        assistant_text.encode("utf-8")
                    ).hexdigest(),
                    "assistant_chars": len(assistant_text),
                },
                timestamp,
            )

    def fail_turn(
        self,
        owner_id: str,
        session_id: str,
        turn_id: str,
        *,
        error: str,
        interrupted: bool = False,
    ) -> None:
        timestamp = _now()
        status = "interrupted" if interrupted else "failed"
        safe_error = _safe_error(error)
        with self._transaction() as connection:
            self._require_owned_session(connection, owner_id, session_id)
            turn = self._require_running_turn(connection, turn_id)
            if turn["session_id"] != session_id:
                raise SessionNotFound(session_id)
            connection.execute(
                "UPDATE turns SET status = ?, error = ?, finished_at = ? WHERE id = ?",
                (status, safe_error, timestamp, turn_id),
            )
            self._append_event(
                connection,
                session_id,
                turn_id,
                f"turn_{status}",
                {"error": safe_error},
                timestamp,
            )
            connection.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (timestamp, session_id),
            )

    def list_audit_events(
        self,
        owner_id: str,
        session_id: str,
    ) -> list[dict[str, Any]]:
        with self._connection() as connection:
            self._require_owned_session(connection, owner_id, session_id)
            rows = connection.execute(
                """SELECT id, turn_id, event_type, payload_json, occurred_at
                   FROM audit_events WHERE session_id = ? ORDER BY id""",
                (session_id,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "turn_id": row["turn_id"],
                "event_type": row["event_type"],
                "payload": json.loads(row["payload_json"]),
                "occurred_at": row["occurred_at"],
            }
            for row in rows
        ]

    @staticmethod
    def _replace_messages(
        connection: sqlite3.Connection,
        session_id: str,
        messages: Sequence[dict[str, Any]],
    ) -> None:
        connection.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
        connection.executemany(
            "INSERT INTO messages(session_id, position, body_json) VALUES (?, ?, ?)",
            [
                (session_id, position, _encode(message))
                for position, message in enumerate(messages)
            ],
        )

    @staticmethod
    def _append_event(
        connection: sqlite3.Connection,
        session_id: str,
        turn_id: str | None,
        event_type: str,
        payload: dict[str, Any],
        timestamp: str,
    ) -> None:
        connection.execute(
            """INSERT INTO audit_events(
                session_id, turn_id, event_type, payload_json, occurred_at
            ) VALUES (?, ?, ?, ?, ?)""",
            (session_id, turn_id, event_type, _encode(payload), timestamp),
        )

    @staticmethod
    def _require_owned_session(
        connection: sqlite3.Connection,
        owner_id: str,
        session_id: str,
    ) -> sqlite3.Row:
        row = connection.execute(
            "SELECT * FROM sessions WHERE id = ? AND owner_id = ?",
            (session_id, owner_id),
        ).fetchone()
        if row is None:
            raise SessionNotFound(session_id)
        return row

    @staticmethod
    def _require_running_turn(
        connection: sqlite3.Connection,
        turn_id: str,
    ) -> sqlite3.Row:
        row = connection.execute(
            "SELECT * FROM turns WHERE id = ? AND status = 'running'",
            (turn_id,),
        ).fetchone()
        if row is None:
            raise RuntimeError(f"Turn {turn_id} is not running.")
        return row

    def _recover_stale_turns(
        self,
        connection: sqlite3.Connection,
        session_id: str,
    ) -> None:
        rows = connection.execute(
            "SELECT id, process_id FROM turns "
            "WHERE session_id = ? AND status = 'running'",
            (session_id,),
        ).fetchall()
        for row in rows:
            if self._process_is_running(row["process_id"]):
                continue
            timestamp = _now()
            connection.execute(
                "UPDATE turns SET status = 'interrupted', finished_at = ? "
                "WHERE id = ?",
                (timestamp, row["id"]),
            )
            self._append_event(
                connection,
                session_id,
                row["id"],
                "turn_interrupted",
                {"reason": "agent process exited before completion"},
                timestamp,
            )
