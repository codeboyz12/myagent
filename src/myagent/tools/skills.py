from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[3]
SKILLS_DIR = PROJECT_DIR / "skills"


def list_skills() -> str:
    """
    List available skills with their descriptions.
    """

    if not SKILLS_DIR.exists():
        return "No skills directory found."

    results = []

    for skill_dir in sorted(SKILLS_DIR.iterdir()):

        skill_file = skill_dir / "SKILL.md"

        if not skill_file.is_file():
            continue

        content = skill_file.read_text(encoding="utf-8")
        lines = content.splitlines()

        name = skill_dir.name
        description = "No description available."

        for line in lines:

            if line.startswith("# "):
                name = line[2:].strip()

            if line.startswith("Description:"):
                description = line.split(":", 1)[1].strip()
                break

        results.append(
            f"Name: {name}\n"
            f"Skill ID: {skill_dir.name}\n"
            f"Description: {description}"
        )

    if not results:
        return "No skills available."

    return "\n\n".join(results)


def load_skill(skill_name: str) -> str:
    """
    Load a skill's SKILL.md instructions.
    """

    skill_path = (SKILLS_DIR / skill_name / "SKILL.md").resolve()

    # Prevent path traversal outside the skills directory.
    if not skill_path.is_relative_to(SKILLS_DIR.resolve()):
        return "Error: invalid skill path."

    if not skill_path.is_file():
        return f"Error: skill '{skill_name}' not found."

    return skill_path.read_text(encoding="utf-8")
