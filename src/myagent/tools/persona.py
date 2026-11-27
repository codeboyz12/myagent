import json
import os
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[3]
PERSONA_DIR = PROJECT_DIR / "data" / "personas"


def _persona_path(persona_id: str, persona_dir: Path) -> Path:
    if (
        not persona_id
        or persona_id in {".", ".."}
        or "/" in persona_id
        or "\\" in persona_id
    ):
        raise ValueError("Invalid persona ID.")
    resolved_dir = persona_dir.expanduser().resolve()
    resolved_path = (resolved_dir / f"{persona_id}.json").resolve()
    if not resolved_path.is_relative_to(resolved_dir):
        raise ValueError("Persona path is outside the allowed directory.")
    return resolved_path


def get_persona(persona_id: str, *, persona_dir: Path = PERSONA_DIR) -> str:
    """
    Retrieve a persona profile.
    """

    try:
        persona_path = _persona_path(persona_id, persona_dir)
    except ValueError as error:
        return f"Error: {error}"

    if not persona_path.is_file():
        return "No persona profile found."

    os.chmod(persona_dir, 0o700)
    os.chmod(persona_path, 0o600)
    with open(persona_path, "r", encoding="utf-8") as f:
        persona = json.load(f)

    return json.dumps(
        persona,
        ensure_ascii=False,
        indent=2
    )


def list_personas(*, persona_dir: Path = PERSONA_DIR) -> str:
    """List persona IDs in the caller's scoped persona directory."""
    if not persona_dir.is_dir():
        return "No persona profiles found."
    persona_ids = sorted(
        path.stem for path in persona_dir.glob("*.json") if path.is_file()
    )
    return json.dumps(persona_ids, ensure_ascii=False, indent=2)


def delete_persona(persona_id: str, *, persona_dir: Path = PERSONA_DIR) -> str:
    """Delete a persona profile from the caller's scoped directory."""
    try:
        persona_path = _persona_path(persona_id, persona_dir)
    except ValueError as error:
        return f"Error: {error}"
    if not persona_path.is_file():
        return "No persona profile found."
    persona_path.unlink()
    return f"Persona deleted: {persona_id}"


def update_persona(
    persona_id: str,
    field: str,
    value: str,
    confidence: str,
    evidence: str,
    *,
    persona_dir: Path = PERSONA_DIR,
) -> str:
    """
    Add or update a persona attribute.
    """

    allowed_fields = {
        "goals",
        "interests",
        "priorities",
        "preferences",
        "pain_points",
        "objections"
    }

    allowed_confidence = {
        "high",
        "medium",
        "low"
    }

    if field not in allowed_fields:
        return f"Error: unsupported field '{field}'."

    if confidence not in allowed_confidence:
        return "Error: confidence must be high, medium, or low."

    try:
        persona_path = _persona_path(persona_id, persona_dir)
    except ValueError as error:
        return f"Error: {error}"

    persona_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(persona_dir, 0o700)

    # Load existing profile or initialize a new one.
    if persona_path.is_file():
        with open(persona_path, "r", encoding="utf-8") as f:
            persona = json.load(f)
    else:
        persona = {
            "goals": [],
            "interests": [],
            "priorities": [],
            "preferences": [],
            "pain_points": [],
            "objections": []
        }

    entry = {
        "value": value,
        "confidence": confidence,
        "evidence": evidence
    }

    # Avoid duplicate entries.
    persona[field] = [
        item for item in persona[field]
        if item["value"] != value
    ]

    persona[field].append(entry)

    descriptor = os.open(
        persona_path,
        os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    os.chmod(persona_path, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as f:
        json.dump(
            persona,
            f,
            ensure_ascii=False,
            indent=2
        )

    return f"Persona updated: {field} = {value}"
