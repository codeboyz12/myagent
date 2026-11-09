"""Capabilities bound to one session's data and workspace scope."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ToolContext:
    workspace_root: Path
    persona_dir: Path
