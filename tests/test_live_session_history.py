"""Opt-in integration test against a running OpenAI-compatible model server."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

import ai
from dotenv import load_dotenv

from myagent.adapter.ai_sdk import create_model
from myagent.agents.myagent import SYSTEM_PROMPT
from myagent.sessions import SQLiteSessionStore, SessionManager


LIVE_TEST_ENABLED = os.getenv("MYAGENT_RUN_LIVE_SESSION_TEST") == "1"


@unittest.skipUnless(
    LIVE_TEST_ENABLED,
    "set MYAGENT_RUN_LIVE_SESSION_TEST=1 to call the configured model server",
)
class LiveSessionHistoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_two_turn_history_survives_reopening_sqlite_store(self):
        load_dotenv()
        model = create_model()

        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "sessions.sqlite3"
            store = SQLiteSessionStore(database)
            manager = SessionManager(
                store,
                owner_id="live-session-test",
                data_dir=temporary,
                workspace_root=Path(temporary) / "workspace",
                persona_root=Path(temporary) / "personas",
            )
            session = manager.create_session([ai.system_message(SYSTEM_PROMPT)])

            first_answer = await manager.run_turn(
                session.id,
                "Remember this session marker: cobalt-614. Reply with ACK only.",
                model,
                request_id="live-turn-1",
            )
            second_answer = await manager.run_turn(
                session.id,
                "What was the session marker? Reply with the marker only.",
                model,
                request_id="live-turn-2",
            )

            self.assertTrue(first_answer.strip())
            self.assertTrue(second_answer.strip())

            reopened = SessionManager(
                SQLiteSessionStore(database),
                owner_id="live-session-test",
                data_dir=temporary,
                workspace_root=Path(temporary) / "workspace",
                persona_root=Path(temporary) / "personas",
            )
            state = reopened.load_session(session.id)
            self.assertEqual(
                [message.role for message in state.messages],
                ["system", "user", "assistant", "user", "assistant"],
            )
            self.assertEqual(
                [
                    message.text
                    for message in state.messages
                    if message.role == "user"
                ],
                [
                    "Remember this session marker: cobalt-614. Reply with ACK only.",
                    "What was the session marker? Reply with the marker only.",
                ],
            )
            self.assertEqual(state.summary.last_turn_status, "completed")


if __name__ == "__main__":
    unittest.main()
