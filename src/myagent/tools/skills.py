import os
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[3]
SKILLS_DIR = PROJECT_DIR / "skills"


def _system_skills_dir() -> Path:
    """Return Codex's system-provided skills directory, if installed."""
    codex_home = Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser()
    return codex_home / "skills" / ".system"


def _skill_dirs() -> list[tuple[str, Path]]:
    return [("", SKILLS_DIR), ("system/", _system_skills_dir())]


def list_skills() -> str:
    """
    List available skills with their descriptions.
    """

    if not any(directory.is_dir() for _, directory in _skill_dirs()):
        return "No skills directory found."

    results = []

    for prefix, root in _skill_dirs():
        if not root.is_dir():
            continue
        for skill_dir in sorted(root.iterdir()):
            skill_file = skill_dir / "SKILL.md"
            if not skill_file.is_file():
                continue
            content = skill_file.read_text(encoding="utf-8")
            lines = content.splitlines()
            name = skill_dir.name
            description = "No description available."
            for line in lines:
                stripped = line.strip()
                if stripped.startswith("name:") and name == skill_dir.name:
                    name = stripped.split(":", 1)[1].strip().strip("\"'")
                if line.startswith("# "):
                    name = line[2:].strip()
                if stripped.startswith(("Description:", "description:")):
                    description = stripped.split(":", 1)[1].strip().strip("\"'")
                    break
            results.append(
                f"Name: {name}\n"
                f"Skill ID: {prefix}{skill_dir.name}\n"
                f"Description: {description}"
            )

    if not results:
        return "No skills available."

    return "\n\n".join(results)


def load_skill(skill_name: str) -> str:
    """
    Load a skill's SKILL.md instructions.
    """

    prefix = "system/" if skill_name.startswith("system/") else ""
    skill_id = skill_name.removeprefix(prefix)
    root = _system_skills_dir() if prefix else SKILLS_DIR
    skill_path = (root / skill_id / "SKILL.md").resolve()

    # Prevent path traversal outside the selected skills directory.
    if not skill_path.is_relative_to(root.resolve()):
        return "Error: invalid skill path."

    if not skill_path.is_file():
        return f"Error: skill '{skill_name}' not found."

    return skill_path.read_text(encoding="utf-8")
