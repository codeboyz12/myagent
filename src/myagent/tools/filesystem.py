from pathlib import Path


def read_file(path: str, offset: int = 1, limit: int = 200) -> str:
    """Read lines from a file, with optional offset and limit."""
    p = Path(path)
    if not p.exists():
        return f"Error: file not found: {path}"
    lines = p.read_text(errors="replace").splitlines()
    selected = lines[offset - 1: offset - 1 + limit]
    return "\n".join(f"{offset + i}: {line}" for i, line in enumerate(selected))
