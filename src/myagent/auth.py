"""SQLite-backed accounts and expiring opaque bearer tokens."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from collections.abc import Iterator


PASSWORD_ITERATIONS = 600_000
ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60
_DUMMY_SALT = bytes.fromhex("d5aa1c8703bdb7c4ea3605d6b28a45f1")
_DUMMY_HASH = bytes(32)


class AccountAlreadyExists(ValueError):
    """An account already uses this email address."""


class AuthRateLimitExceeded(RuntimeError):
    """An authentication bucket reached its attempt limit."""

    def __init__(self, retry_after_seconds: int) -> None:
        self.retry_after_seconds = max(1, retry_after_seconds)
        super().__init__("Too many authentication attempts; try again later.")


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str


def _normalize_email(email: str) -> str:
    normalized = email.strip().casefold()
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


def _password_hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
        dklen=32,
    )


class SQLiteAuthStore:
    """Persist account credentials and hashes of issued access tokens."""

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
        connection.execute("PRAGMA foreign_keys = ON")
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
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    password_salt BLOB NOT NULL,
                    password_hash BLOB NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS access_tokens (
                    token_hash TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS access_tokens_expiry
                    ON access_tokens(expires_at);
                CREATE TABLE IF NOT EXISTS auth_rate_limits (
                    bucket_hash TEXT PRIMARY KEY,
                    window_started_at INTEGER NOT NULL,
                    attempts INTEGER NOT NULL
                );
                """
            )

    def register(self, email: str, password: str) -> AuthUser:
        normalized_email = _normalize_email(email)
        if not 12 <= len(password) <= 128:
            raise ValueError("Password must be between 12 and 128 characters.")
        salt = secrets.token_bytes(16)
        password_hash = _password_hash(password, salt)
        user = AuthUser(id=str(uuid.uuid4()), email=normalized_email)
        try:
            with self._connection() as connection:
                connection.execute(
                    "INSERT INTO users(id, email, password_salt, password_hash, created_at) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (user.id, user.email, salt, password_hash, int(time.time())),
                )
        except sqlite3.IntegrityError as error:
            raise AccountAlreadyExists("An account with this email already exists.") from error
        return user

    def authenticate(self, email: str, password: str) -> AuthUser | None:
        try:
            normalized_email = _normalize_email(email)
        except ValueError:
            normalized_email = ""
        with self._connection() as connection:
            row = connection.execute(
                "SELECT id, email, password_salt, password_hash FROM users WHERE email = ?",
                (normalized_email,),
            ).fetchone()

        salt = bytes(row["password_salt"]) if row else _DUMMY_SALT
        expected_hash = bytes(row["password_hash"]) if row else _DUMMY_HASH
        supplied_hash = _password_hash(password, salt)
        if row is None or not hmac.compare_digest(supplied_hash, expected_hash):
            return None
        return AuthUser(id=row["id"], email=row["email"])

    def create_access_token(
        self,
        owner_id: str,
        *,
        ttl_seconds: int = ACCESS_TOKEN_TTL_SECONDS,
    ) -> str:
        if ttl_seconds <= 0:
            raise ValueError("Token lifetime must be positive.")
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).hexdigest()
        expires_at = int(time.time()) + ttl_seconds
        with self._connection() as connection:
            connection.execute(
                "DELETE FROM access_tokens WHERE expires_at <= ?", (int(time.time()),)
            )
            connection.execute(
                "INSERT INTO access_tokens(token_hash, owner_id, expires_at) "
                "VALUES (?, ?, ?)",
                (token_hash, owner_id, expires_at),
            )
        return token

    def owner_for_access_token(self, token: str) -> str | None:
        if not token or len(token) > 512:
            return None
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self._connection() as connection:
            row = connection.execute(
                "SELECT owner_id FROM access_tokens WHERE token_hash = ? AND expires_at > ?",
                (token_hash, int(time.time())),
            ).fetchone()
        return row["owner_id"] if row else None

    def revoke_access_token(self, token: str, owner_id: str) -> bool:
        if not token or len(token) > 512:
            return False
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self._connection() as connection:
            cursor = connection.execute(
                "DELETE FROM access_tokens WHERE token_hash = ? AND owner_id = ?",
                (token_hash, owner_id),
            )
        return cursor.rowcount == 1

    def consume_rate_limit(
        self, bucket: str, *, limit: int, window_seconds: int
    ) -> None:
        """Atomically count a request without persisting its raw IP/email key."""
        if limit <= 0 or window_seconds <= 0:
            raise ValueError("Rate limit and window must be positive.")
        bucket_hash = hashlib.sha256(bucket.encode("utf-8")).hexdigest()
        now = int(time.time())
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM auth_rate_limits WHERE window_started_at < ?",
                (now - 24 * 60 * 60,),
            )
            row = connection.execute(
                "SELECT window_started_at, attempts FROM auth_rate_limits "
                "WHERE bucket_hash = ?",
                (bucket_hash,),
            ).fetchone()
            if row is None or now >= row["window_started_at"] + window_seconds:
                connection.execute(
                    "INSERT INTO auth_rate_limits(bucket_hash, window_started_at, attempts) "
                    "VALUES (?, ?, 1) ON CONFLICT(bucket_hash) DO UPDATE SET "
                    "window_started_at = excluded.window_started_at, attempts = 1",
                    (bucket_hash, now),
                )
            elif row["attempts"] >= limit:
                raise AuthRateLimitExceeded(
                    row["window_started_at"] + window_seconds - now
                )
            else:
                connection.execute(
                    "UPDATE auth_rate_limits SET attempts = attempts + 1 "
                    "WHERE bucket_hash = ?",
                    (bucket_hash,),
                )
