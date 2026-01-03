"""Security utilities for path validation."""
from pathlib import Path


def validate_export_path(output_path: str) -> Path:
    """Validate export path to prevent directory traversal.

    Args:
        output_path: Path to validate

    Returns:
        Resolved absolute Path object

    Raises:
        ValueError: If path is unsafe or in forbidden directory
    """
    abs_path = Path(output_path).resolve()

    # Prevent system directories
    forbidden = ["/etc", "/bin", "/usr", "/var", "/sys", "/proc"]
    if any(str(abs_path).startswith(f) for f in forbidden):
        raise ValueError(f"Cannot export to system directory: {abs_path}")

    # Create parent with restrictive permissions
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.parent.chmod(0o700)

    return abs_path
