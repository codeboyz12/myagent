import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import ai
from ai.providers.openai import OpenAIParams

from myagent.sessions import (
    SQLiteSessionStore,
    SessionBusy,
    SessionManager,
    SessionNotFound,
)
from myagent.tools.filesystem import read_file
from myagent.tools.persona import get_persona, update_persona
from myagent.tools import ToolContext, get_agent_tools


class FakeStream:
    def __init__(self, messages, *, fail=False):
        self.messages = [*messages, ai.assistant_message("saved answer")]
        self.output = "saved answer"
        self.fail = fail
        self.tool_call_id = "tool-call-1"
        self.tool_result = ai.types.messages.ToolResultPart(
            tool_call_id=self.tool_call_id,
            tool_name="read_file",
            result="file contents",
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def __aiter__(self):
        tool_message = ai.assistant_message(
            ai.types.messages.ToolCallPart(
                tool_call_id=self.tool_call_id,
                tool_name="read_file",
                tool_args='{"path":"inside.txt","api_key":"secret"}',
            )
        )
        yield ai.events.ToolStart(
            message=tool_message,
            tool_call_id=self.tool_call_id,
            tool_name="read_file",
        )
        yield ai.events.TextDelta(chunk="saved ")
        if self.fail:
            raise RuntimeError("provider failed api_key=secret-value")
        yield ai.events.TextDelta(chunk="answer")
        yield ai.events.ToolCallResult(
            message=ai.tool_message(self.tool_result),
            results=[self.tool_result],
        )


class FakeAgent:
    def __init__(self, context, *, fail=False):
        self.context = context
        self.fail = fail

    def run(self, model, messages):
        return FakeStream(messages, fail=self.fail)


class ParamsCaptureAgent:
    def __init__(self, context, captures):
        self.captures = captures

    def run(self, model, messages, *, params=None):
        self.captures.append((messages, params))
        return FakeStream(messages)


class SessionTests(unittest.IsolatedAsyncioTestCase):
    async def test_chatgpt_plan_instructions_keep_priority_and_local_roles(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteSessionStore(Path(temporary) / "sessions.sqlite3")
            captures = []
            manager = SessionManager(
                store,
                owner_id="alice",
                data_dir=temporary,
                workspace_root=temporary,
                agent_factory=lambda context: ParamsCaptureAgent(context, captures),
            )
            session = manager.create_session([ai.system_message("stale prompt")])

            await manager.run_turn(
                session.id,
                "Hello",
                SimpleNamespace(id="gpt-6-luna"),
                request_id="oauth-turn",
                base_system_instruction="Base application rules",
                system_instruction="OpenUI application rules",
                chatgpt_plan=True,
            )

            oauth_messages, oauth_params = captures[-1]
            self.assertEqual([message.role for message in oauth_messages], ["user"])
            self.assertEqual(oauth_messages[0].text, "Hello")
            self.assertEqual(
                oauth_params.extra_body["instructions"],
                "Base application rules\n\nOpenUI application rules",
            )
            self.assertFalse(oauth_params.provider_params[OpenAIParams].store)

            await manager.run_turn(
                session.id,
                "Hello again",
                SimpleNamespace(id="local-lfm"),
                request_id="local-turn",
                base_system_instruction="Base application rules",
                system_instruction="OpenUI application rules",
            )

            local_messages, local_params = captures[-1]
            self.assertEqual(
                [message.role for message in local_messages],
                ["system", "system", "user", "assistant", "user"],
            )
            self.assertEqual(local_messages[0].text, "Base application rules")
            self.assertEqual(local_messages[1].text, "OpenUI application rules")
            self.assertIsNone(local_params)

    async def test_multi_turn_history_survives_reopening_store(self):
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "sessions.sqlite3"
            store = SQLiteSessionStore(database)
            agent_calls = []

            def make_agent(context):
                agent_calls.append(context)
                return FakeAgent(context)

            manager = SessionManager(
                store,
                owner_id="alice",
                data_dir=temporary,
                workspace_root=temporary,
                agent_factory=make_agent,
            )
            session = manager.create_session([ai.system_message("system")])

            answer = await manager.run_turn(
                session.id,
                "remember this",
                SimpleNamespace(id="fake-model"),
                request_id="request-1",
            )
            second_answer = await manager.run_turn(
                session.id,
                "and this too",
                SimpleNamespace(id="fake-model"),
                request_id="request-2",
            )

            self.assertEqual(answer, "saved answer")
            self.assertEqual(second_answer, "saved answer")
            reopened = SessionManager(
                SQLiteSessionStore(database),
                owner_id="alice",
                data_dir=temporary,
                workspace_root=temporary,
                agent_factory=make_agent,
            )
            repeated_answer = await reopened.run_turn(
                session.id,
                "remember this",
                SimpleNamespace(id="fake-model"),
                request_id="request-1",
            )
            loaded = reopened.load_session(session.id)
            self.assertEqual(repeated_answer, answer)
            self.assertEqual(len(agent_calls), 2)
            self.assertEqual(
                [message.role for message in loaded.messages],
                ["system", "user", "assistant", "user", "assistant"],
            )
            self.assertEqual(
                [message.text for message in loaded.messages if message.role == "user"],
                ["remember this", "and this too"],
            )
            events = reopened.store.list_audit_events("alice", session.id)
            self.assertIn("turn_started", [event["event_type"] for event in events])
            self.assertIn("turn_completed", [event["event_type"] for event in events])
            tool_started = next(
                event for event in events if event["event_type"] == "tool_started"
            )
            self.assertEqual(tool_started["payload"]["arguments"]["api_key"], "[REDACTED]")
            tool_completed = next(
                event for event in events if event["event_type"] == "tool_completed"
            )
            self.assertNotIn("file contents", str(tool_completed["payload"]))

    async def test_failure_keeps_partial_text_and_does_not_commit_incomplete_history(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteSessionStore(Path(temporary) / "sessions.sqlite3")
            manager = SessionManager(
                store,
                owner_id="alice",
                data_dir=temporary,
                workspace_root=temporary,
                agent_factory=lambda context: FakeAgent(context, fail=True),
            )
            session = manager.create_session([ai.system_message("system")])

            with self.assertRaisesRegex(RuntimeError, "provider failed"):
                await manager.run_turn(
                    session.id,
                    "question",
                    SimpleNamespace(id="fake-model"),
                    request_id="failed-request",
                )

            self.assertEqual(len(manager.load_session(session.id).messages), 1)
            events = store.list_audit_events("alice", session.id)
            partial = [event["payload"].get("text") for event in events]
            self.assertIn("saved ", partial)
            self.assertIn("turn_failed", [event["event_type"] for event in events])
            self.assertNotIn("secret-value", str(events))

            with self.assertRaisesRegex(RuntimeError, "already ended as failed"):
                await manager.run_turn(
                    session.id,
                    "question",
                    SimpleNamespace(id="fake-model"),
                    request_id="failed-request",
                )

    async def test_agent_initialization_failure_marks_turn_failed(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteSessionStore(Path(temporary) / "sessions.sqlite3")

            def fail_to_build_agent(context):
                raise RuntimeError("agent setup failed")

            manager = SessionManager(
                store,
                owner_id="alice",
                data_dir=temporary,
                workspace_root=temporary,
                agent_factory=fail_to_build_agent,
            )
            session = manager.create_session([ai.system_message("system")])
            with self.assertRaisesRegex(RuntimeError, "agent setup failed"):
                await manager.run_turn(
                    session.id,
                    "question",
                    SimpleNamespace(id="fake-model"),
                )

            self.assertEqual(manager.load_session(session.id).summary.last_turn_status, "failed")

    async def test_owner_cannot_load_another_owners_session(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteSessionStore(Path(temporary) / "sessions.sqlite3")
            owner = SessionManager(
                store,
                owner_id="alice",
                data_dir=temporary,
                workspace_root=temporary,
            )
            other = SessionManager(
                store,
                owner_id="bob",
                data_dir=temporary,
                workspace_root=temporary,
            )
            session = owner.create_session([ai.system_message("system")])

            with self.assertRaises(SessionNotFound):
                other.load_session(session.id)

    async def test_session_database_is_private_to_current_user(self):
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "sessions.sqlite3"
            SQLiteSessionStore(database)
            self.assertEqual(os.stat(database).st_mode & 0o777, 0o600)

    async def test_live_turn_blocks_duplicate_and_dead_turn_is_recovered(self):
        with tempfile.TemporaryDirectory() as temporary:
            live_processes = {1234}
            store = SQLiteSessionStore(
                Path(temporary) / "sessions.sqlite3",
                process_is_running=lambda process_id: process_id in live_processes,
            )
            manager = SessionManager(
                store,
                owner_id="alice",
                data_dir=temporary,
                workspace_root=temporary,
            )
            session = manager.create_session([ai.system_message("system")])
            store.begin_turn(
                "alice",
                session.id,
                user_text="first",
                model_id="fake-model",
                process_id=1234,
            )

            with self.assertRaises(SessionBusy):
                store.begin_turn(
                    "alice",
                    session.id,
                    user_text="duplicate",
                    model_id="fake-model",
                    process_id=1234,
                )

            live_processes.clear()
            store.begin_turn(
                "alice",
                session.id,
                user_text="after recovery",
                model_id="fake-model",
                process_id=5678,
            )
            event_types = [
                event["event_type"]
                for event in store.list_audit_events("alice", session.id)
            ]
            self.assertIn("turn_interrupted", event_types)


class SessionStoreTests(unittest.TestCase):
    def test_lifecycle_and_listing_are_scoped_to_owner(self):
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "sessions.sqlite3"
            store = SQLiteSessionStore(database)
            alice_session = store.create_session("alice", [{"role": "system"}])
            bob_session = store.create_session("bob", [{"role": "system"}])

            self.assertEqual(
                [session.id for session in store.list_sessions("alice")],
                [alice_session.id],
            )
            with self.assertRaises(SessionNotFound):
                store.load_messages("bob", alice_session.id)
            with self.assertRaises(SessionNotFound):
                store.delete_session("bob", alice_session.id)

            store.delete_session("alice", alice_session.id)
            with self.assertRaises(SessionNotFound):
                store.get_session("alice", alice_session.id)
            self.assertEqual(
                [session.id for session in store.list_sessions("bob")],
                [bob_session.id],
            )

    def test_failed_completion_rolls_back_message_replacement(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = SQLiteSessionStore(Path(temporary) / "sessions.sqlite3")
            session = store.create_session("alice", [{"role": "system", "content": "keep"}])
            turn_id = store.begin_turn(
                "alice",
                session.id,
                user_text="question",
                model_id="fake-model",
                request_id="request-1",
            )

            with self.assertRaises(TypeError):
                store.complete_turn(
                    "alice",
                    session.id,
                    turn_id,
                    messages=[{"role": "user"}, {"invalid": object()}],
                    assistant_text="answer",
                )

            self.assertEqual(
                store.load_messages("alice", session.id),
                [{"role": "system", "content": "keep"}],
            )
            with self.assertRaises(SessionBusy):
                store.begin_turn(
                    "alice",
                    session.id,
                    user_text="another question",
                    model_id="fake-model",
                )

    def test_delete_refuses_live_turn_then_removes_stale_session(self):
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "sessions.sqlite3"
            live_processes = {601}
            store = SQLiteSessionStore(
                database,
                process_is_running=lambda process_id: process_id in live_processes,
            )
            session = store.create_session("alice", [])
            store.begin_turn(
                "alice",
                session.id,
                user_text="in progress",
                model_id="fake-model",
                process_id=601,
            )

            with self.assertRaises(SessionBusy):
                store.delete_session("alice", session.id)
            self.assertEqual(len(store.list_sessions("alice")), 1)

            live_processes.clear()
            store.delete_session("alice", session.id)
            self.assertEqual(store.list_sessions("alice"), [])
            with self.assertRaises(SessionNotFound):
                store.get_session("alice", session.id)

    def test_clear_all_refuses_live_turn_and_persists_empty_database(self):
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "sessions.sqlite3"
            live_processes = {501}
            store = SQLiteSessionStore(
                database,
                process_is_running=lambda process_id: process_id in live_processes,
            )
            first = store.create_session("alice", [])
            store.create_session("bob", [])
            store.begin_turn(
                "alice",
                first.id,
                user_text="still running",
                model_id="fake-model",
                process_id=501,
            )

            with self.assertRaises(SessionBusy):
                store.clear_all_sessions()
            self.assertEqual(len(store.list_sessions("alice")), 1)
            self.assertEqual(len(store.list_sessions("bob")), 1)

            live_processes.clear()
            self.assertEqual(store.clear_all_sessions(), 2)
            reopened = SQLiteSessionStore(database)
            self.assertEqual(reopened.list_sessions("alice"), [])
            self.assertEqual(reopened.list_sessions("bob"), [])


class ScopedToolTests(unittest.TestCase):
    def test_file_reads_are_confined_to_workspace(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "workspace"
            root.mkdir()
            allowed = root / "inside.txt"
            allowed.write_text("safe", encoding="utf-8")
            outside = Path(temporary) / "outside.txt"
            outside.write_text("private", encoding="utf-8")

            self.assertIn("safe", read_file("inside.txt", root=root))
            self.assertIn(
                "outside the allowed workspace",
                read_file(str(outside), root=root),
            )
            self.assertIn(
                "outside the allowed workspace",
                read_file("../outside.txt", root=root),
            )

    def test_ai_sdk_tools_bind_workspace_context(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "allowed"
            root.mkdir()
            (root / "inside.txt").write_text("in scope", encoding="utf-8")
            outside = Path(temporary) / "outside.txt"
            outside.write_text("out of scope", encoding="utf-8")
            tools = get_agent_tools(ToolContext(root, root / "personas"))
            self.assertEqual(
                [tool.name for tool in tools],
                [
                    "list_files",
                    "read_file",
                    "list_skills",
                    "load_skill",
                    "get_persona",
                    "list_personas",
                    "update_persona",
                    "delete_persona",
                ],
            )
            self.assertIn(
                "in scope",
                asyncio.run(tools[1].fn(path="inside.txt")),
            )
            self.assertIn(
                "outside the allowed workspace",
                asyncio.run(tools[1].fn(path=str(outside))),
            )

    def test_persona_ids_and_directories_are_isolated(self):
        with tempfile.TemporaryDirectory() as temporary:
            alice_dir = Path(temporary) / "alice"
            bob_dir = Path(temporary) / "bob"
            result = update_persona(
                "current_user",
                "goals",
                "learn",
                "high",
                "explicitly stated",
                persona_dir=alice_dir,
            )

            self.assertIn("Persona updated", result)
            self.assertEqual(alice_dir.stat().st_mode & 0o777, 0o700)
            self.assertEqual(
                (alice_dir / "current_user.json").stat().st_mode & 0o777,
                0o600,
            )
            self.assertEqual(
                get_persona("current_user", persona_dir=bob_dir),
                "No persona profile found.",
            )
            self.assertIn(
                "Invalid persona ID",
                get_persona("../alice/current_user", persona_dir=alice_dir),
            )

            outside = Path(temporary) / "outside.json"
            outside.write_text('{"secret":"do not read"}', encoding="utf-8")
            (alice_dir / "linked.json").symlink_to(outside)
            self.assertIn(
                "outside the allowed directory",
                get_persona("linked", persona_dir=alice_dir),
            )


if __name__ == "__main__":
    unittest.main()
