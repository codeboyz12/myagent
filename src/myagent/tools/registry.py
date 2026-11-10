"""Bind application tools to a session's allowed data scope."""

import json
from collections.abc import Callable
from typing import Any, Literal

import ai

from myagent.tools.context import ToolContext
from myagent.tools.filesystem import list_files as _list_files
from myagent.tools.filesystem import read_file as _read_file
from myagent.tools.persona import get_persona as _get_persona
from myagent.tools.persona import list_personas as _list_personas
from myagent.tools.persona import delete_persona as _delete_persona
from myagent.tools.persona import update_persona as _update_persona
from myagent.tools.skills import list_skills as _list_skills
from myagent.tools.skills import load_skill as _load_skill
from myagent.tools.mcp import MCPServerConfig, build_mcp_tools


def _run_tool(function: Callable[..., Any], **arguments: Any) -> str:
    try:
        return str(function(**arguments))
    except Exception as error:
        return f"Tool execution error: {error}"


def get_agent_tools(context: ToolContext) -> list[ai.AgentTool]:
    """Create SDK tools whose file and persona access is session-scoped."""

    @ai.tool
    async def read_file(path: str, offset: int = 1, limit: int = 200) -> str:
        """Read lines from a file in the allowed workspace."""
        return _run_tool(
            _read_file,
            path=path,
            offset=offset,
            limit=limit,
            root=context.workspace_root,
        )

    @ai.tool
    async def list_files(path: str = ".", limit: int = 200) -> str:
        """List files and folders immediately inside a workspace directory."""
        return _run_tool(
            _list_files,
            path=path,
            limit=limit,
            root=context.workspace_root,
        )

    @ai.tool
    async def list_skills() -> str:
        """Discover available Skills and their descriptions."""
        return _run_tool(_list_skills, library=context.library.get("skills") if context.library else None)

    @ai.tool
    async def load_skill(skill_name: str) -> str:
        """Load the full SKILL.md instructions for a selected Skill."""
        return _run_tool(_load_skill, skill_name=skill_name, library=context.library.get("skills") if context.library else None)

    @ai.tool
    async def get_persona(persona_id: str) -> str:
        """Retrieve a profile belonging to this user."""
        if context.library:
            item = next((item for item in context.library.get("personas", []) if item.get("id") == persona_id and item.get("enabled")), None)
            if item:
                return str(item.get("content", ""))
        return _run_tool(
            _get_persona,
            persona_id=persona_id,
            persona_dir=context.persona_dir,
        )

    @ai.tool
    async def list_personas() -> str:
        """List persona profile IDs available in this session."""
        stored = _run_tool(_list_personas, persona_dir=context.persona_dir)
        if not context.library:
            return stored
        try:
            ids = json.loads(stored) if stored.startswith("[") else []
        except json.JSONDecodeError:
            ids = []
        ids.extend(item["id"] for item in context.library.get("personas", []) if item.get("enabled"))
        return json.dumps(sorted(set(ids)), ensure_ascii=False)

    @ai.tool
    async def delete_persona(persona_id: str) -> str:
        """Delete a persona profile from this session."""
        return _run_tool(
            _delete_persona,
            persona_id=persona_id,
            persona_dir=context.persona_dir,
        )

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
        """Store an explicitly shared persona attribute for this user."""
        return _run_tool(
            _update_persona,
            persona_id=persona_id,
            field=field,
            value=value,
            confidence=confidence,
            evidence=evidence,
            persona_dir=context.persona_dir,
        )

    return [
        list_files,
        read_file,
        list_skills,
        load_skill,
        get_persona,
        list_personas,
        update_persona,
        delete_persona,
    ] + (context.mcp_tools or [])
