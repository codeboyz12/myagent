"""Capabilities bound to one session's data and workspace scope."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ToolContext:
    workspace_root: Path
    persona_dir: Path
    library: dict[str, list[dict[str, Any]]] | None = None
    mcp_servers: list[Any] | None = None
    mcp_tools: list[Any] | None = None
