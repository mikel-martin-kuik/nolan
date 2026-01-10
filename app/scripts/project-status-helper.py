#!/usr/bin/env python3
"""
project-status-helper.py - Get project status from coordinator file

Usage: project-status-helper.py <project-name>

Outputs:
- Coordinator file name
- Project status (COMPLETE, ACTIVE, PENDING, DELEGATED)
- Coordinator file contents
"""
import sys
import os
import re
import yaml
from pathlib import Path


def parse_team_name(team_file: Path) -> str:
    """Parse team name from .team file (supports YAML and plain text formats)."""
    content = team_file.read_text()
    try:
        data = yaml.safe_load(content)
        if isinstance(data, dict) and 'team' in data:
            return data['team']
        else:
            return content.strip()
    except:
        return content.strip()


def get_coordinator_file(project_path: Path) -> str | None:
    """Get coordinator's output file from team config."""
    team_file = project_path / '.team'
    if not team_file.exists():
        return None

    team_name = parse_team_name(team_file)
    nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))
    config_path = nolan_root / 'teams' / f'{team_name}.yaml'

    if not config_path.exists():
        return None

    try:
        config = yaml.safe_load(config_path.read_text())
        coordinator_name = config['team']['workflow']['coordinator']
        for agent in config['team']['agents']:
            if agent['name'] == coordinator_name:
                return agent.get('output_file')
    except Exception as e:
        print(f"Error loading team config: {e}", file=sys.stderr)
        return None

    return None


def detect_status(content: str) -> tuple[str, str]:
    """Detect project status from coordinator file content."""
    # Check for structured markers
    if '<!-- PROJECT:STATUS:COMPLETE' in content:
        marker = re.search(r'<!-- PROJECT:STATUS:[^\n]+', content)
        return "COMPLETE (structured marker)", marker.group(0) if marker else ""

    if '<!-- PROJECT:STATUS:CLOSED' in content:
        return "CLOSED (structured marker)", ""

    if '<!-- PROJECT:STATUS:ARCHIVED' in content:
        return "ARCHIVED (structured marker)", ""

    if '<!-- PROJECT:STATUS:DELEGATED' in content:
        marker = re.search(r'<!-- PROJECT:STATUS:DELEGATED:([^:]+):([^:]+)', content)
        if marker:
            return f"DELEGATED to {marker.group(1)} ({marker.group(2)})", ""
        return "DELEGATED", ""

    if '<!-- PROJECT:STATUS:PENDING' in content:
        return "PENDING (awaiting assignment)", ""

    # Check for content-based detection
    if re.search(r'\*\*(Status|Phase)\*?\*?:.*\b(COMPLETE|CLOSED|DEPLOYED|PRODUCTION.READY)\b', content, re.IGNORECASE):
        return "COMPLETE (detected from content)", "Consider adding structured marker: `<!-- PROJECT:STATUS:COMPLETE:YYYY-MM-DD -->`"

    return "ACTIVE", ""


def main():
    if len(sys.argv) < 2:
        print("Usage: project-status-helper.py <project-name>")
        sys.exit(1)

    project_name = sys.argv[1]
    projects_dir = Path(os.environ.get('PROJECTS_DIR', os.path.expanduser('~/nolan/projects')))
    project_path = projects_dir / project_name

    if not project_path.exists():
        print(f"Project directory not found: {project_path}")
        sys.exit(1)

    # Get coordinator file
    coord_file = get_coordinator_file(project_path)
    if not coord_file:
        print("Could not determine coordinator file from team config")
        print("Ensure .team file exists and team config is valid")
        sys.exit(1)

    print(f"**Coordinator file**: {coord_file}")
    print()

    coord_path = project_path / coord_file
    if not coord_path.exists():
        print(f"**Status:** PENDING (no {coord_file})")
        sys.exit(0)

    content = coord_path.read_text()
    status, note = detect_status(content)

    print(f"**Status:** {status}")
    if note:
        print(note)
    print()

    print("---")
    print(f"## {coord_file}")
    print()
    print(content)


if __name__ == "__main__":
    main()
