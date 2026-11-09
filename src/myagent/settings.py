"""Owner-scoped, versioned settings storage with separately encrypted secrets."""

from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _cipher() -> Fernet:
    key = os.getenv("MYAGENT_SETTINGS_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError(
            "MYAGENT_SETTINGS_ENCRYPTION_KEY must be configured to store provider keys."
        )
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as error:
        raise RuntimeError(
            "MYAGENT_SETTINGS_ENCRYPTION_KEY must be a valid Fernet key."
        ) from error


class SQLiteUserSettingsStore:
    """Store extensible per-owner namespaces and encrypted secret values."""

    def __init__(self, path: str | Path) -> None:
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
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.execute("PRAGMA synchronous = FULL")
        return connection

    @contextmanager
    def _connection(self) -> Iterator[sqlite3.Connection]:
        connection = self._connect()
        try:
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
                CREATE TABLE IF NOT EXISTS user_settings (
                    owner_id TEXT NOT NULL,
                    namespace TEXT NOT NULL,
                    schema_version INTEGER NOT NULL,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (owner_id, namespace)
                );
                CREATE TABLE IF NOT EXISTS user_secrets (
                    owner_id TEXT NOT NULL,
                    namespace TEXT NOT NULL,
                    secret_name TEXT NOT NULL,
                    encrypted_value BLOB NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (owner_id, namespace, secret_name)
                );
                """
            )

    def get(self, owner_id: str, namespace: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT schema_version, value_json, updated_at FROM user_settings "
                "WHERE owner_id = ? AND namespace = ?",
                (owner_id, namespace),
            ).fetchone()
        if row is None:
            return None
        return {
            "schema_version": row["schema_version"],
            "values": json.loads(row["value_json"]),
            "updated_at": row["updated_at"],
        }

    def has_secret(self, owner_id: str, namespace: str, secret_name: str) -> bool:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT 1 FROM user_secrets WHERE owner_id = ? AND namespace = ? "
                "AND secret_name = ?",
                (owner_id, namespace, secret_name),
            ).fetchone()
        return row is not None

    def get_secret(self, owner_id: str, namespace: str, secret_name: str) -> str | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT encrypted_value FROM user_secrets WHERE owner_id = ? "
                "AND namespace = ? AND secret_name = ?",
                (owner_id, namespace, secret_name),
            ).fetchone()
        if row is None:
            return None
        try:
            return _cipher().decrypt(bytes(row["encrypted_value"])).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError) as error:
            raise RuntimeError("A saved provider secret could not be decrypted.") from error

    def save(
        self,
        owner_id: str,
        namespace: str,
        *,
        schema_version: int,
        values: Mapping[str, Any],
        secrets: Mapping[str, str] | None = None,
        clear_secrets: tuple[str, ...] = (),
    ) -> None:
        encrypted = {
            name: _cipher().encrypt(value.encode("utf-8"))
            for name, value in (secrets or {}).items()
        }
        timestamp = _now()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "INSERT INTO user_settings(owner_id, namespace, schema_version, "
                "value_json, updated_at) VALUES (?, ?, ?, ?, ?) "
                "ON CONFLICT(owner_id, namespace) DO UPDATE SET "
                "schema_version = excluded.schema_version, "
                "value_json = excluded.value_json, updated_at = excluded.updated_at",
                (owner_id, namespace, schema_version, json.dumps(values), timestamp),
            )
            for name in clear_secrets:
                connection.execute(
                    "DELETE FROM user_secrets WHERE owner_id = ? AND namespace = ? "
                    "AND secret_name = ?",
                    (owner_id, namespace, name),
                )
            for name, ciphertext in encrypted.items():
                connection.execute(
                    "INSERT INTO user_secrets(owner_id, namespace, secret_name, "
                    "encrypted_value, updated_at) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT(owner_id, namespace, secret_name) DO UPDATE SET "
                    "encrypted_value = excluded.encrypted_value, "
                    "updated_at = excluded.updated_at",
                    (owner_id, namespace, name, ciphertext, timestamp),
                )
