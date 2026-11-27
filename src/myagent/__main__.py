import asyncio
import argparse
import json
import os
from pathlib import Path

import ai
from dotenv import load_dotenv
from myagent.adapter.ai_sdk import create_fallback_model, create_model
from myagent.agents.myagent import SYSTEM_PROMPT, myagent
from myagent.sessions import SQLiteSessionStore, SessionManager


def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="Run myagent sessions.")
    parser.add_argument("--session", help="Resume an existing session by ID.")
    parser.add_argument(
        "--list-sessions",
        action="store_true",
        help="List sessions belonging to the configured owner.",
    )
    parser.add_argument(
        "--audit-session",
        help="Print audit events for a session belonging to the configured owner.",
    )
    args = parser.parse_args()
    selected_actions = sum(
        bool(value) for value in (args.session, args.list_sessions, args.audit_session)
    )
    if selected_actions > 1:
        parser.error("Choose only one of --session, --list-sessions, or --audit-session.")

    owner_id = os.getenv("MYAGENT_OWNER_ID", "local-user").strip() or "local-user"
    data_dir = Path(os.getenv("MYAGENT_DATA_DIR", "~/.myagent")).expanduser()
    store = SQLiteSessionStore(data_dir / "sessions.sqlite3")
    sessions = SessionManager(
        store,
        owner_id=owner_id,
        data_dir=data_dir,
        workspace_root=os.getenv("MYAGENT_WORKSPACE", str(Path.cwd())),
    )

    if args.list_sessions:
        for session in sessions.list_sessions():
            state = session.last_turn_status or "new"
            print(f"{session.id}  {state}  {session.updated_at}")
        return
    if args.audit_session:
        try:
            events = sessions.audit_events(args.audit_session)
        except LookupError:
            parser.error(f"Session not found: {args.audit_session}")
        print(json.dumps(events, ensure_ascii=False, indent=2))
        return

    model = create_model()
    fallback_model = create_fallback_model()
    if args.session:
        try:
            state = sessions.load_session(args.session)
        except LookupError:
            parser.error(f"Session not found: {args.session}")
        session = state.summary
        if session.last_turn_status == "interrupted":
            print("Previous turn was interrupted. Its partial text is saved in the audit log.")
    else:
        session = sessions.create_session([ai.system_message(SYSTEM_PROMPT)])

    print(f"Session: {session.id}")
    asyncio.run(myagent(model, sessions, session.id, fallback_model))


if __name__ == "__main__":
    main()
