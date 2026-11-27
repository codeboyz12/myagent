import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from myagent.auth import AccountAlreadyExists, SQLiteAuthStore


class AuthStoreTests(unittest.TestCase):
    def test_accounts_and_bearer_tokens_persist_without_storing_passwords(self):
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "auth.sqlite3"
            store = SQLiteAuthStore(database)
            user = store.register("Alice@example.com", "correct horse battery")
            token = store.create_access_token(user.id)

            reopened = SQLiteAuthStore(database)
            self.assertEqual(
                reopened.authenticate("alice@example.com", "correct horse battery"),
                user,
            )
            self.assertIsNone(reopened.authenticate("alice@example.com", "wrong password"))
            self.assertEqual(reopened.owner_for_access_token(token), user.id)
            self.assertIsNone(reopened.owner_for_access_token("unknown-token"))
            self.assertNotIn("correct horse battery", database.read_text(errors="ignore"))

    def test_email_is_unique_without_case_sensitivity(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteAuthStore(Path(temporary) / "auth.sqlite3")
            store.register("Alice@example.com", "correct horse battery")

            with self.assertRaises(AccountAlreadyExists):
                store.register("alice@EXAMPLE.com", "another secure password")

    def test_access_token_expires(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteAuthStore(Path(temporary) / "auth.sqlite3")
            user = store.register("alice@example.com", "correct horse battery")
            with patch("myagent.auth.time.time", return_value=1_000):
                token = store.create_access_token(user.id, ttl_seconds=30)

            with patch("myagent.auth.time.time", return_value=1_029):
                self.assertEqual(store.owner_for_access_token(token), user.id)
            with patch("myagent.auth.time.time", return_value=1_030):
                self.assertIsNone(store.owner_for_access_token(token))

    def test_access_token_can_be_revoked(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteAuthStore(Path(temporary) / "auth.sqlite3")
            user = store.register("alice@example.com", "correct horse battery")
            token = store.create_access_token(user.id)

            self.assertTrue(store.revoke_access_token(token, user.id))
            self.assertIsNone(store.owner_for_access_token(token))
            self.assertFalse(store.revoke_access_token(token, user.id))

    def test_rate_limit_rejects_excess_attempts_and_resets_after_window(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteAuthStore(Path(temporary) / "auth.sqlite3")
            with patch("myagent.auth.time.time", return_value=1_000):
                store.consume_rate_limit("signin:ip:test", limit=2, window_seconds=60)
                store.consume_rate_limit("signin:ip:test", limit=2, window_seconds=60)
                with self.assertRaisesRegex(RuntimeError, "try again"):
                    store.consume_rate_limit("signin:ip:test", limit=2, window_seconds=60)

            with patch("myagent.auth.time.time", return_value=1_060):
                store.consume_rate_limit("signin:ip:test", limit=2, window_seconds=60)


if __name__ == "__main__":
    unittest.main()
