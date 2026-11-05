import json
from pathlib import Path

from tools.filesystem import read_file

def get_tool_registry():
    return {
        "read_file": read_file
    }


SCHEMA_PATH = Path(__file__).parent / "schemas" / "tool_schemas.json"


def get_tool_schemas():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)
