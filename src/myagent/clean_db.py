"""Command-line utility for clearing persisted conversation data."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from myagent.sessions import SQLiteSessionStore, SessionBusy


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clear all sessions and conversation history from SQLite."
    )
    parser.add_argument(
        "--data-dir",
        help="Directory containing sessions.sqlite3 (defaults to MYAGENT_DATA_DIR or ~/.myagent).",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip the interactive confirmation.",
    )
    args = parser.parse_args()

    data_dir = Path(
        args.data_dir or os.getenv("MYAGENT_DATA_DIR", "~/.myagent")
    ).expanduser().resolve()
    database_path = data_dir / "sessions.sqlite3"
    if not database_path.is_file():
        print(f"No session database found at {database_path}")
        return

    if not args.yes:
        print(f"This will permanently delete all session history in {database_path}.")
        try:
            confirmation = input('Type "clean" to continue: ')
        except EOFError:
            parser.exit(2, "Confirmation required. Re-run with --yes to proceed.\n")
        if confirmation != "clean":
            print("Canceled; no data was deleted.")
            return

    try:
        session_count = SQLiteSessionStore(database_path).clear_all_sessions()
    except SessionBusy as error:
        parser.exit(1, f"{error}\n")
    print(f"Cleared {session_count} session(s) from {database_path}")


if __name__ == "__main__":
    main()
