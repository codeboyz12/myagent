import json
from pathlib import Path

from tools.filesystem import read_file
from tools.skills import list_skills, load_skill
from tools.persona import get_persona, update_persona


def get_tool_registry():

    return {
        "read_file": read_file,

        # Skill tools
        "list_skills": list_skills,
        "load_skill": load_skill,

        # Persona tools
        "get_persona": get_persona,
        "update_persona": update_persona,
    }


SCHEMA_PATH = Path(__file__).parent / "schemas" / "tool_schemas.json"


def get_tool_schemas():

    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)