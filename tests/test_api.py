import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import ai
from fastapi.testclient import TestClient

from myagent.auth import SQLiteAuthStore
from myagent.api import create_app
from myagent.sessions import SQLiteSessionStore


class FakeStream:
    def __init__(self, messages):
        self.messages = [*messages, ai.assistant_message("hello from agent")]
        self.output = "hello from agent"

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def __aiter__(self):
        yield ai.events.TextDelta(chunk="hello from agent")


class FakeAgent:
    def __init__(self, context, calls):
        self.context = context
        self.calls = calls

    def run(self, model, messages):
        self.calls.append((self.context, messages))
        return FakeStream(messages)


class SessionApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.agent_calls = []
        self.app = create_app(
            store=SQLiteSessionStore(root / "sessions.sqlite3"),
            auth_store=SQLiteAuthStore(root / "auth.sqlite3"),
            model=SimpleNamespace(id="test-model"),
            api_tokens={"alice-token": "alice", "bob-token": "bob"},
            data_dir=root / "data",
            workspace_root=root / "workspaces",
            agent_factory=lambda context: FakeAgent(context, self.agent_calls),
            signup_enabled=True,
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.temporary.cleanup()

    @staticmethod
    def headers(token):
        return {"Authorization": f"Bearer {token}"}

    def test_authentication_is_required(self):
        response = self.client.get("/sessions")
        self.assertEqual(response.status_code, 401)
        response = self.client.get("/sessions", headers=self.headers("invalid"))
        self.assertEqual(response.status_code, 401)

    def test_every_session_route_requires_a_valid_bearer_token(self):
        session_id = "00000000-0000-4000-8000-000000000000"
        requests = (
            self.client.post("/sessions"),
            self.client.get("/sessions"),
            self.client.get(f"/sessions/{session_id}"),
            self.client.delete(f"/sessions/{session_id}"),
            self.client.post(
                f"/sessions/{session_id}/messages",
                json={"content": "hello"},
            ),
            self.client.get(f"/sessions/{session_id}/messages"),
        )
        self.assertEqual([response.status_code for response in requests], [401] * 6)

    def test_invalid_message_body_is_rejected_without_running_agent(self):
        headers = self.headers("alice-token")
        created = self.client.post("/sessions", headers=headers)
        session_id = created.json()["session_id"]

        response = self.client.post(
            f"/sessions/{session_id}/messages",
            headers=headers,
            json={"content": ""},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.agent_calls, [])

    def test_signup_signin_and_authenticated_session_ownership(self):
        signup = self.client.post(
            "/auth/signup",
            json={"email": "new-user@example.com", "password": "correct horse battery"},
        )
        self.assertEqual(signup.status_code, 201, signup.text)
        signup_data = signup.json()
        self.assertEqual(signup_data["token_type"], "bearer")
        self.assertGreater(signup_data["expires_in"], 0)
        user_headers = self.headers(signup_data["access_token"])

        created = self.client.post("/sessions", headers=user_headers)
        self.assertEqual(created.status_code, 201, created.text)
        session_id = created.json()["session_id"]

        signin = self.client.post(
            "/auth/signin",
            json={"email": "NEW-USER@example.com", "password": "correct horse battery"},
        )
        self.assertEqual(signin.status_code, 200, signin.text)
        signed_in_headers = self.headers(signin.json()["access_token"])
        self.assertEqual(
            self.client.get(f"/sessions/{session_id}", headers=signed_in_headers).status_code,
            200,
        )

        other_signup = self.client.post(
            "/auth/signup",
            json={"email": "other@example.com", "password": "another secure password"},
        )
        other_headers = self.headers(other_signup.json()["access_token"])
        self.assertEqual(
            self.client.get(f"/sessions/{session_id}", headers=other_headers).status_code,
            404,
        )

    def test_signup_rejects_duplicate_email_and_signin_hides_credential_failure(self):
        body = {"email": "duplicate@example.com", "password": "correct horse battery"}
        first = self.client.post("/auth/signup", json=body)
        self.assertEqual(first.status_code, 201)
        duplicate = self.client.post(
            "/auth/signup",
            json={"email": "DUPLICATE@example.com", "password": "different secure password"},
        )
        self.assertEqual(duplicate.status_code, 409)

        wrong_password = self.client.post(
            "/auth/signin",
            json={"email": "duplicate@example.com", "password": "incorrect password"},
        )
        unknown_user = self.client.post(
            "/auth/signin",
            json={"email": "unknown@example.com", "password": "incorrect password"},
        )
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(unknown_user.status_code, 401)
        self.assertEqual(wrong_password.json(), unknown_user.json())

    def test_signout_revokes_database_issued_token(self):
        signup = self.client.post(
            "/auth/signup",
            json={"email": "signout@example.com", "password": "correct horse battery"},
        )
        token = signup.json()["access_token"]
        headers = self.headers(token)
        self.assertEqual(self.client.get("/sessions", headers=headers).status_code, 200)

        signed_out = self.client.post("/auth/signout", headers=headers)

        self.assertEqual(signed_out.status_code, 204)
        self.assertEqual(self.client.get("/sessions", headers=headers).status_code, 401)

    def test_signup_rate_limit_returns_retry_after(self):
        with patch("myagent.api.SIGNUP_ATTEMPT_LIMIT", 1):
            first = self.client.post(
                "/auth/signup",
                json={"email": "first@example.com", "password": "correct horse battery"},
            )
            limited = self.client.post(
                "/auth/signup",
                json={"email": "second@example.com", "password": "correct horse battery"},
            )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(limited.status_code, 429)
        self.assertGreater(int(limited.headers["Retry-After"]), 0)

    def test_session_lifecycle_and_idempotent_message(self):
        headers = self.headers("alice-token")
        created = self.client.post("/sessions", headers=headers)
        self.assertEqual(created.status_code, 201)
        session_id = created.json()["session_id"]

        sent = self.client.post(
            f"/sessions/{session_id}/messages",
            headers={**headers, "Idempotency-Key": "message-1"},
            json={"content": "hi"},
        )
        self.assertEqual(sent.status_code, 200, sent.text)
        self.assertEqual(sent.json()["response"], "hello from agent")
        retried = self.client.post(
            f"/sessions/{session_id}/messages",
            headers={**headers, "Idempotency-Key": "message-1"},
            json={"content": "hi"},
        )
        self.assertEqual(retried.status_code, 200, retried.text)
        self.assertEqual(len(self.agent_calls), 1)

        history = self.client.get(f"/sessions/{session_id}/messages", headers=headers)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(
            [(message["role"], message["content"]) for message in history.json()["messages"]],
            [("user", "hi"), ("assistant", "hello from agent")],
        )
        listed = self.client.get("/sessions", headers=headers)
        self.assertEqual([item["session_id"] for item in listed.json()["sessions"]], [session_id])
        self.assertEqual(self.client.delete(f"/sessions/{session_id}", headers=headers).status_code, 204)
        self.assertEqual(self.client.get(f"/sessions/{session_id}", headers=headers).status_code, 404)

    def test_tool_context_is_isolated_between_sessions_for_one_owner(self):
        headers = self.headers("alice-token")
        first = self.client.post("/sessions", headers=headers).json()["session_id"]
        second = self.client.post("/sessions", headers=headers).json()["session_id"]

        for session_id in (first, second):
            response = self.client.post(
                f"/sessions/{session_id}/messages",
                headers=headers,
                json={"content": "hello"},
            )
            self.assertEqual(response.status_code, 200, response.text)

        first_context, second_context = [call[0] for call in self.agent_calls]
        self.assertNotEqual(first_context.workspace_root, second_context.workspace_root)
        self.assertNotEqual(first_context.persona_dir, second_context.persona_dir)

    def test_deleting_session_removes_its_workspace_and_persona_files(self):
        headers = self.headers("alice-token")
        session_id = self.client.post("/sessions", headers=headers).json()["session_id"]
        response = self.client.post(
            f"/sessions/{session_id}/messages",
            headers=headers,
            json={"content": "hello"},
        )
        self.assertEqual(response.status_code, 200)
        workspace, persona = self.agent_calls[0][0].workspace_root, self.agent_calls[0][0].persona_dir
        workspace.mkdir(parents=True)
        persona.mkdir(parents=True)
        (workspace / "private.txt").write_text("workspace data", encoding="utf-8")
        (persona / "private.json").write_text("{}", encoding="utf-8")

        deleted = self.client.delete(f"/sessions/{session_id}", headers=headers)

        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(workspace.exists())
        self.assertFalse(persona.exists())

    def test_message_rate_limit_stops_excess_model_calls(self):
        headers = self.headers("alice-token")
        session_id = self.client.post("/sessions", headers=headers).json()["session_id"]
        with patch("myagent.api.MESSAGE_ATTEMPT_LIMIT", 1):
            first = self.client.post(
                f"/sessions/{session_id}/messages",
                headers=headers,
                json={"content": "hello"},
            )
            limited = self.client.post(
                f"/sessions/{session_id}/messages",
                headers=headers,
                json={"content": "again"},
            )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(limited.status_code, 429)
        self.assertEqual(len(self.agent_calls), 1)

    def test_owner_isolation_hides_other_users_sessions(self):
        alice = self.client.post("/sessions", headers=self.headers("alice-token"))
        session_id = alice.json()["session_id"]
        bob_headers = self.headers("bob-token")
        self.assertEqual(self.client.get(f"/sessions/{session_id}", headers=bob_headers).status_code, 404)
        self.assertEqual(self.client.delete(f"/sessions/{session_id}", headers=bob_headers).status_code, 404)
        self.assertEqual(
            self.client.post(
                f"/sessions/{session_id}/messages",
                headers=bob_headers,
                json={"content": "should not reach Alice's session"},
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get("/sessions", headers=bob_headers).json()["sessions"], [])

    def test_health_does_not_require_authentication(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
