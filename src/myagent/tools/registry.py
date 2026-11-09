"""AI SDK tool definitions backed by the project's existing tool functions."""

from collections.abc import Callable
from typing import Any, Literal

import ai

from myagent.tools.filesystem import read_file as _read_file
from myagent.tools.persona import get_persona as _get_persona
from myagent.tools.persona import update_persona as _update_persona
from myagent.tools.skills import list_skills as _list_skills
from myagent.tools.skills import load_skill as _load_skill


def _run_tool(function: Callable[..., Any], **arguments: Any) -> str:
    try:
        return str(function(**arguments))
    except Exception as error:
        return f"Tool execution error: {error}"


@ai.tool
async def read_file(path: str, offset: int = 1, limit: int = 200) -> str:
    """Read lines from a file, with optional offset and limit."""
    return _run_tool(_read_file, path=path, offset=offset, limit=limit)


@ai.tool
async def list_skills() -> str:
    """Discover available Skills and their descriptions."""
    return _run_tool(_list_skills)


@ai.tool
async def load_skill(skill_name: str) -> str:
    """Load the full SKILL.md instructions for a selected Skill."""
    return _run_tool(_load_skill, skill_name=skill_name)


@ai.tool
async def get_persona(persona_id: str) -> str:
    """Retrieve an existing persona profile for a conversation."""
    return _run_tool(_get_persona, persona_id=persona_id)


@ai.tool
async def update_persona(
    persona_id: str,
    field: Literal[
        "goals",
        "interests",
        "priorities",
        "preferences",
        "pain_points",
        "objections",
    ],
    value: str,
    confidence: Literal["high", "medium", "low"],
    evidence: str,
) -> str:
    """Store a relevant, explicitly shared or consented persona attribute."""
    return _run_tool(
        _update_persona,
        persona_id=persona_id,
        field=field,
        value=value,
        confidence=confidence,
        evidence=evidence,
    )


def get_agent_tools() -> list[ai.AgentTool]:
    """Return tools in the form expected by ``ai.Agent``."""
    return [read_file, list_skills, load_skill, get_persona, update_persona]
