from pathlib import Path


def _workspace_path(path: str, root: Path | None) -> Path:
    candidate = Path(path)
    if root is None:
        return candidate.resolve()
    workspace = root.expanduser().resolve()
    resolved = (candidate if candidate.is_absolute() else workspace / candidate).resolve()
    if not resolved.is_relative_to(workspace):
        raise ValueError("Path is outside the allowed workspace.")
    return resolved


def list_files(path: str = ".", limit: int = 200, *, root: Path | None = None) -> str:
    """List files and folders immediately inside a workspace directory."""
    try:
        directory = _workspace_path(path, root)
    except ValueError as error:
        return f"Error: {error}"
    if not directory.exists():
        return f"Error: directory not found: {path}"
    if not directory.is_dir():
        return f"Error: not a directory: {path}"
    if limit < 1 or limit > 500:
        return "Error: limit must be between 1 and 500."

    entries = []
    for entry in sorted(directory.iterdir(), key=lambda item: item.name.casefold()):
        try:
            resolved = entry.resolve()
        except OSError:
            continue
        if root is not None and not resolved.is_relative_to(root.expanduser().resolve()):
            continue
        marker = "directory" if resolved.is_dir() else "file"
        entries.append(f"[{marker}] {entry.name}")
        if len(entries) == limit:
            break
    if not entries:
        return "Directory is empty."
    return "\n".join(entries)


def read_file(
    path: str,
    offset: int = 1,
    limit: int = 200,
    *,
    root: Path | None = None,
) -> str:
    """Read lines from a file, with optional offset and limit."""
    try:
        p = _workspace_path(path, root)
    except ValueError:
        return "Error: file is outside the allowed workspace."
    if not p.exists():
        return f"Error: file not found: {path}"
    lines = p.read_text(errors="replace").splitlines()
    selected = lines[offset - 1: offset - 1 + limit]
    return "\n".join(f"{offset + i}: {line}" for i, line in enumerate(selected))
