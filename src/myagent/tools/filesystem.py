from pathlib import Path


def read_file(
    path: str,
    offset: int = 1,
    limit: int = 200,
    *,
    root: Path | None = None,
) -> str:
    """Read lines from a file, with optional offset and limit."""
    p = Path(path)
    if root is not None:
        root = root.resolve()
        p = (p if p.is_absolute() else root / p).resolve()
        if not p.is_relative_to(root):
            return "Error: file is outside the allowed workspace."
    if not p.exists():
        return f"Error: file not found: {path}"
    lines = p.read_text(errors="replace").splitlines()
    selected = lines[offset - 1: offset - 1 + limit]
    return "\n".join(f"{offset + i}: {line}" for i, line in enumerate(selected))
