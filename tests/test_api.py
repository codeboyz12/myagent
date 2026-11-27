import tempfile
import unittest
import os
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import ai
from fastapi.testclient import TestClient

from myagent.auth import SQLiteAuthStore
from myagent.api import _provider_usage_counts, _tool_activities, create_app
from myagent.sessions import SQLiteSessionStore
from myagent.tools.filesystem import list_files
from cryptography.fernet import Fernet


class FakeStream:
    def __init__(self, messages):
        self.messages = [*messages, ai.assistant_message("hello from agent")]
        self.output = "hello from agent"

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def __aiter__(self):
        yield ai.events.StreamStart()
        yield ai.events.TextDelta(chunk="hello from agent")
        yield ai.events.StreamEnd(
            usage=ai.types.usage.Usage(
                input_tokens=3, output_tokens=2,
                raw={"prompt_tokens": 3, "completion_tokens": 2},
            )
        )


class FakeAgent:
    def __init__(self, context, calls):
        self.context = context
        self.calls = calls

    def run(self, model, messages, **kwargs):
        self.calls.append((self.context, messages))
        return FakeStream(messages)


class FailedStream:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def __aiter__(self):
        yield ai.events.StreamStart()
        raise RuntimeError("provider failed")


class FailedAgent:
    def run(self, model, messages):
        return FailedStream()


class MultiCallStream(FakeStream):
    async def __aiter__(self):
        yield ai.events.StreamStart()
        yield ai.events.StreamEnd(
            usage=ai.types.usage.Usage(input_tokens=2, output_tokens=3, raw={"prompt_tokens": 2, "completion_tokens": 3})
        )
        yield ai.events.StreamStart()
        yield ai.events.StreamEnd(
            usage=ai.types.usage.Usage(input_tokens=5, output_tokens=7, raw={"prompt_tokens": 5, "completion_tokens": 7})
        )


class MultiCallAgent:
    def run(self, model, messages):
        return MultiCallStream(messages)


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

    def test_mcp_settings_have_protected_builtin_and_owner_scoped_custom_servers(self):
        alice = self.headers("alice-token")
        bob = self.headers("bob-token")
        initial = self.client.get("/settings/mcp-servers", headers=alice)
        self.assertEqual(initial.status_code, 200)
        self.assertTrue(initial.json()["builtin"]["built_in"])
        self.assertEqual(initial.json()["builtin"]["id"], "searxng")

        saved = self.client.put(
            "/settings/mcp-servers",
            headers=alice,
            json={
                "builtin_enabled": False,
                "servers": [{
                    "id": "weather", "name": "Weather", "transport": "http",
                    "url": "https://mcp.example.org/mcp", "enabled": True,
                    "built_in": False,
                }],
            },
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertFalse(saved.json()["builtin"]["enabled"])
        self.assertEqual(saved.json()["servers"][0]["id"], "weather")
        self.assertEqual(self.client.get("/settings/mcp-servers", headers=bob).json()["servers"], [])

    def test_mcp_connection_check_uses_saved_server_and_returns_no_secret(self):
        headers = self.headers("alice-token")
        self.client.put("/settings/mcp-servers", headers=headers, json={
            "builtin_enabled": True,
            "servers": [{"id": "weather", "name": "Weather", "transport": "http",
                         "url": "https://mcp.example.org/mcp", "enabled": True,
                         "built_in": False, "token": "secret-value"}],
        })
        with patch("myagent.api.MCPToolAdapter.list_tools", new=AsyncMock(return_value=[SimpleNamespace(name="forecast")])) as check:
            response = self.client.post("/settings/mcp-servers/check", headers=headers, json={"server_id": "weather"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"ok": True, "tool_count": 1})
        self.assertEqual(check.await_args.args[0].token, "secret-value")
        self.assertNotIn("secret-value", response.text)

    def test_mcp_connection_check_rejects_unknown_server(self):
        response = self.client.post("/settings/mcp-servers/check", headers=self.headers("alice-token"), json={"server_id": "missing"})
        self.assertEqual(response.status_code, 404)

    def test_agent_library_saves_builtin_descriptions_over_legacy_limit(self):
        headers = self.headers("alice-token")
        initial = self.client.get("/settings/agent-library", headers=headers)
        self.assertEqual(initial.status_code, 200, initial.text)
        settings = initial.json()
        settings["skills"].append({
            "id": "audit-custom-skill",
            "name": "Audit custom skill",
            "description": "x" * 570,
            "content": "Use this temporary skill for API validation testing.",
            "enabled": True,
            "built_in": False,
        })

        saved = self.client.put("/settings/agent-library", headers=headers, json=settings)

        self.assertEqual(saved.status_code, 200, saved.text)
        saved_item = next(
            item for item in saved.json()["skills"] if item["id"] == "audit-custom-skill"
        )
        self.assertEqual(saved_item["description"], "x" * 570)

    def test_search_tool_activity_includes_only_http_source_links(self):
        activities = _tool_activities([
            {"event_type": "tool_started", "payload": {
                "tool_call_id": "search-1", "tool_name": "searxng_web_search", "arguments": {},
            }},
            {"event_type": "tool_completed", "payload": {
                "tool_call_id": "search-1", "tool_name": "searxng_web_search",
                "sources": [
                    {"url": "https://docs.example.org", "title": "Official docs"},
                    {"url": "javascript:alert(1)", "title": "Unsafe"},
                ],
            }},
        ])
        self.assertEqual(activities[0].sources, [{
            "url": "https://docs.example.org", "title": "Official docs",
        }])

    def test_search_tool_activity_includes_only_secure_image_urls_with_source_pages(self):
        activities = _tool_activities([
            {"event_type": "tool_started", "payload": {
                "tool_call_id": "images-1", "tool_name": "searxng_web_search", "arguments": {},
            }},
            {"event_type": "tool_completed", "payload": {
                "tool_call_id": "images-1", "tool_name": "searxng_web_search",
                "images": [
                    {"url": "https://images.example.org/temple.jpg", "source_url": "https://commons.wikimedia.org/wiki/Temple", "title": "Temple"},
                    {"url": "http://images.example.org/no.jpg", "source_url": "https://example.org"},
                    {"url": "https://images.example.org/orphan.jpg", "source_url": "file:///etc/passwd"},
                ],
            }},
        ])
        self.assertEqual(activities[0].images, [{
            "url": "https://images.example.org/temple.jpg",
            "source_url": "https://commons.wikimedia.org/wiki/Temple",
            "title": "Temple",
        }])

    def test_provider_usage_normalization_preserves_missing_and_subset_fields(self):
        usage = ai.types.usage.Usage(
            input_tokens=10,
            output_tokens=6,
            reasoning_tokens=2,
            cache_read_tokens=3,
            raw={
                "prompt_tokens": 10,
                "completion_tokens": 6,
                "prompt_tokens_details": {"cached_tokens": 3},
                "completion_tokens_details": {"reasoning_tokens": 2},
            },
        )
        counts = _provider_usage_counts(usage)
        self.assertEqual(counts, (10, 6, 2, 3))
        self.assertEqual(counts[0] + counts[1], 16)  # subsets are not added twice
        self.assertEqual(
            _provider_usage_counts(ai.types.usage.Usage(input_tokens=0, output_tokens=0, raw={})),
            (None, None, None, None),
        )
        partial = ai.types.usage.Usage(
            input_tokens=0, output_tokens=5, raw={"completion_tokens": 5}
        )
        self.assertEqual(_provider_usage_counts(partial)[:2], (None, 5))

    def test_mcp_settings_reject_builtin_overwrite_and_unsafe_url_schemes(self):
        headers = self.headers("alice-token")
        invalid = self.client.put(
            "/settings/mcp-servers", headers=headers,
            json={"builtin_enabled": True, "servers": [{
                "id": "searxng", "name": "Changed", "transport": "http",
                "url": "https://example.org/mcp", "enabled": True, "built_in": False,
            }]},
        )
        self.assertEqual(invalid.status_code, 422)
        invalid_url = self.client.put(
            "/settings/mcp-servers", headers=headers,
            json={"builtin_enabled": True, "servers": [{
                "id": "unsafe", "name": "Unsafe", "transport": "http",
                "url": "file:///etc/passwd", "enabled": True, "built_in": False,
            }]},
        )
        self.assertEqual(invalid_url.status_code, 422)

    def test_mcp_bearer_tokens_are_encrypted_and_never_returned(self):
        headers = self.headers("alice-token")
        key = Fernet.generate_key().decode()
        with patch.dict(os.environ, {"MYAGENT_SETTINGS_ENCRYPTION_KEY": key}):
            response = self.client.put(
                "/settings/mcp-servers", headers=headers,
                json={"builtin_enabled": True, "servers": [{
                    "id": "private", "name": "Private", "transport": "http",
                    "url": "https://mcp.example.org/mcp", "enabled": True,
                    "built_in": False, "token": "top-secret",
                }]},
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn("top-secret", response.text)
            self.assertTrue(response.json()["servers"][0]["token_configured"])
            store = self.app.state.user_settings_store
            self.assertEqual(store.get_secret("alice", "mcp_servers", "token:private"), "top-secret")

            server = {
                "id": "private", "name": "Private", "transport": "http",
                "url": "https://mcp.example.org/mcp", "enabled": True,
                "built_in": False,
            }
            kept = self.client.put(
                "/settings/mcp-servers", headers=headers,
                json={"builtin_enabled": True, "servers": [server]},
            )
            self.assertEqual(kept.status_code, 200, kept.text)
            self.assertTrue(kept.json()["servers"][0]["token_configured"])
            self.assertEqual(store.get_secret("alice", "mcp_servers", "token:private"), "top-secret")

            replaced = self.client.put(
                "/settings/mcp-servers", headers=headers,
                json={"builtin_enabled": True, "servers": [{**server, "token": "replacement-secret"}]},
            )
            self.assertEqual(replaced.status_code, 200, replaced.text)
            self.assertNotIn("replacement-secret", replaced.text)
            self.assertEqual(store.get_secret("alice", "mcp_servers", "token:private"), "replacement-secret")

            cleared = self.client.put(
                "/settings/mcp-servers", headers=headers,
                json={"builtin_enabled": True, "servers": [{**server, "clear_token": True}]},
            )
            self.assertEqual(cleared.status_code, 200, cleared.text)
            self.assertFalse(cleared.json()["servers"][0]["token_configured"])
            self.assertIsNone(store.get_secret("alice", "mcp_servers", "token:private"))

            self.client.put(
                "/settings/mcp-servers", headers=headers,
                json={"builtin_enabled": True, "servers": [{**server, "token": "remove-secret"}]},
            )
            removed = self.client.put(
                "/settings/mcp-servers", headers=headers,
                json={"builtin_enabled": True, "servers": []},
            )
            self.assertEqual(removed.status_code, 200, removed.text)
            self.assertIsNone(store.get_secret("alice", "mcp_servers", "token:private"))
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

    def test_regenerate_replaces_last_assistant_without_duplicating_user(self):
        headers = self.headers("alice-token")
        session_id = self.client.post("/sessions", headers=headers).json()["session_id"]
        first = self.client.post(f"/sessions/{session_id}/messages", headers={**headers, "Idempotency-Key": "first"}, json={"content": "hi"})
        self.assertEqual(first.status_code, 200, first.text)
        second = self.client.post(f"/sessions/{session_id}/messages", headers={**headers, "Idempotency-Key": "regenerate", "Accept": "application/x-ndjson"}, json={"content": "hi", "regenerate_previous": True})
        self.assertEqual(second.status_code, 200, second.text)
        history = self.client.get(f"/sessions/{session_id}/messages", headers=headers).json()["messages"]
        self.assertEqual([(message["role"], message["content"]) for message in history], [("user", "hi"), ("assistant", "hello from agent")])
        self.assertEqual(len(self.agent_calls), 2)

    def test_usage_analytics_persists_exact_counts_and_is_owner_scoped(self):
        headers = self.headers("alice-token")
        session_id = self.client.post("/sessions", headers=headers).json()["session_id"]
        sent = self.client.post(
            f"/sessions/{session_id}/messages",
            headers={**headers, "Idempotency-Key": "metered-turn"},
            json={"content": "hello"},
        )
        self.assertEqual(sent.status_code, 200, sent.text)
        # A repeated delivery of a completed request does not meter it twice.
        self.client.post(
            f"/sessions/{session_id}/messages",
            headers={**headers, "Idempotency-Key": "metered-turn"},
            json={"content": "hello"},
        )
        today = datetime.now(UTC).date().isoformat()
        result = self.client.get(
            f"/usage/analytics?from={today}&to={today}&timezone=UTC", headers=headers
        )
        self.assertEqual(result.status_code, 200, result.text)
        analytics = result.json()
        self.assertEqual(analytics["overview"]["totalTokens"], 5)
        self.assertEqual(analytics["overview"]["totalChats"], 1)
        self.assertEqual(analytics["overview"]["userMessages"], 1)
        self.assertEqual(analytics["overview"]["assistantMessages"], 1)
        self.assertTrue(analytics["tokenCoverage"]["complete"])
        self.assertEqual(analytics["models"][0]["providerId"], "local")
        bob = self.client.get(
            f"/usage/analytics?from={today}&to={today}&timezone=UTC",
            headers=self.headers("bob-token"),
        ).json()
        self.assertEqual(bob["overview"]["totalChats"], 0)
        self.assertEqual(bob["overview"]["totalTokens"], 0)

    def test_usage_analytics_validates_timezone_and_range(self):
        headers = self.headers("alice-token")
        self.assertEqual(
            self.client.get("/usage/analytics?timezone=Not/AZone", headers=headers).status_code,
            422,
        )
        self.assertEqual(
            self.client.get(
                "/usage/analytics?from=2020-01-01&to=2022-01-01", headers=headers
            ).status_code,
            422,
        )

    def test_usage_analytics_timezone_day_assignment_and_streaks(self):
        store = self.app.state.session_store
        with patch("myagent.sessions.store._now", return_value="2026-11-10T17:30:00+00:00"):
            session = store.create_session("alice", [{"role": "system"}])
        prior = [{"role": "system"}]
        timestamps = ["2026-11-10T17:30:00+00:00", "2026-11-11T17:30:00+00:00"]
        for index, timestamp in enumerate(timestamps):
            with patch("myagent.sessions.store._now", return_value=timestamp):
                turn_id = store.begin_turn(
                    "alice", session.id, user_text=f"question {index}",
                    model_id="gpt-6-luna", request_id=f"tz-turn-{index}",
                )
                store.record_usage(
                    "alice", session.id, turn_id,
                    request_id=f"tz-turn-{index}", invocation_index=0,
                    provider_id="chatgpt-plan", model_id="gpt-6-luna",
                    model_name="GPT-6 Luna", source="oauth",
                    input_tokens=1, output_tokens=2,
                )
                prior = [*prior, {"role": "user"}, {"role": "assistant"}]
                store.complete_turn(
                    "alice", session.id, turn_id,
                    messages=prior, assistant_text="answer",
                )
        result = self.client.get(
            "/usage/analytics?from=2026-11-11&to=2026-11-12&timezone=Asia%2FBangkok",
            headers=self.headers("alice-token"),
        ).json()
        self.assertEqual(result["overview"]["activeDays"], 2)
        self.assertEqual(result["overview"]["currentStreak"], 2)
        self.assertEqual(result["overview"]["longestStreak"], 2)
        self.assertEqual(result["overview"]["userMessages"], 2)
        self.assertEqual(result["overview"]["assistantMessages"], 2)
        utc_day = self.client.get(
            "/usage/analytics?from=2026-11-11&to=2026-11-11&timezone=UTC",
            headers=self.headers("alice-token"),
        ).json()
        self.assertEqual(utc_day["overview"]["totalTokens"], 3)
        self.assertEqual(utc_day["overview"]["activeDays"], 1)

    def test_streamed_usage_is_persisted_once(self):
        headers = self.headers("alice-token")
        session_id = self.client.post("/sessions", headers=headers).json()["session_id"]
        response = self.client.post(
            f"/sessions/{session_id}/messages",
            headers={**headers, "Accept": "application/x-ndjson", "Idempotency-Key": "streamed-usage"},
            json={"content": "stream this"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('"type": "complete"', response.text)
        today = datetime.now(UTC).date().isoformat()
        result = self.client.get(
            f"/usage/analytics?from={today}&to={today}&timezone=UTC", headers=headers
        ).json()
        self.assertEqual(result["overview"]["totalTokens"], 5)
        self.assertEqual(result["models"][0]["invocationCount"], 1)

    def test_failed_model_attempt_is_persisted_with_unavailable_usage(self):
        self.app.state.agent_factory = lambda context: FailedAgent()
        headers = self.headers("alice-token")
        session_id = self.client.post("/sessions", headers=headers).json()["session_id"]
        response = self.client.post(
            f"/sessions/{session_id}/messages",
            headers={**headers, "Idempotency-Key": "failed-invocation"},
            json={"content": "fail this"},
        )
        self.assertEqual(response.status_code, 409)
        today = datetime.now(UTC).date().isoformat()
        result = self.client.get(
            f"/usage/analytics?from={today}&to={today}&timezone=UTC", headers=headers
        ).json()
        self.assertIsNone(result["overview"]["totalTokens"])
        self.assertEqual(result["tokenCoverage"]["invocations"], 1)
        self.assertEqual(result["models"][0]["tokenCoverage"], 0)

    def test_multiple_model_invocations_in_one_agent_turn_are_metered_separately(self):
        self.app.state.agent_factory = lambda context: MultiCallAgent()
        headers = self.headers("alice-token")
        session_id = self.client.post("/sessions", headers=headers).json()["session_id"]
        response = self.client.post(
            f"/sessions/{session_id}/messages",
            headers={**headers, "Idempotency-Key": "multi-invocation"},
            json={"content": "two calls"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        today = datetime.now(UTC).date().isoformat()
        result = self.client.get(
            f"/usage/analytics?from={today}&to={today}&timezone=UTC", headers=headers
        ).json()
        self.assertEqual(result["overview"]["totalTokens"], 17)
        self.assertEqual(result["models"][0]["invocationCount"], 2)

    def test_gpt_6_luna_oauth_usage_keeps_provider_and_model_identity(self):
        settings = self.app.state.user_settings_store
        provider = {
            "id": "chatgpt-plan", "name": "ChatGPT", "base_url": "https://chatgpt.com/backend-api/codex",
            "model_id": "gpt-6-luna", "reasoning_effort": "default", "enabled": True,
            "auth_type": "chatgpt_plan", "models": [{"id": "gpt-6-luna", "name": "GPT-6 Luna"}],
            "model_controls": {}, "model_control_selections": {},
        }
        settings.save("alice", "model-providers", schema_version=1, values={"providers": [provider]})
        settings.save("alice", "model", schema_version=1, values={"active_provider_id": "chatgpt-plan"})
        settings.save(
            "alice", "chatgpt-plan", schema_version=1,
            values={"client_id": "test-client", "expires_at": 4102444800},
            secrets={"access_token": "test-access-token"},
        )
        self.app.state.model = None
        headers = self.headers("alice-token")
        session_id = self.client.post("/sessions", headers=headers).json()["session_id"]
        response = self.client.post(
            f"/sessions/{session_id}/messages",
            headers={**headers, "Idempotency-Key": "luna-oauth"},
            json={"content": "hello", "model_id": "gpt-6-luna"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        today = datetime.now(UTC).date().isoformat()
        result = self.client.get(
            f"/usage/analytics?from={today}&to={today}&timezone=UTC", headers=headers
        ).json()
        self.assertEqual(result["models"][0]["source"], "oauth")
        self.assertEqual(result["models"][0]["providerId"], "chatgpt-plan")
        self.assertEqual(result["models"][0]["modelName"], "GPT-6 Luna")

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
        self.assertEqual(list_files(root=first_context.workspace_root), "Directory is empty.")
        self.assertEqual(list_files(root=second_context.workspace_root), "Directory is empty.")

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
        workspace.mkdir(parents=True, exist_ok=True)
        persona.mkdir(parents=True, exist_ok=True)
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
