#!/usr/bin/env python3
"""
project-status-helper.py - Get project status from note_taker file

Usage: project-status-helper.py <project-name>

Outputs:
- Notes file name
- Project status (COMPLETE, ACTIVE, PENDING, DELEGATED)
- Notes file contents
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


def get_note_taker_file(project_path: Path) -> str | None:
    """Get note_taker's output file from team config (replaces coordinator pattern)."""
    team_file = project_path / '.team'
    if not team_file.exists():
        return None

    team_name = parse_team_name(team_file)
    nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))

    # Search for team config (supports subdirectories)
    config_path = None
    teams_dir = nolan_root / 'teams'
    for path in teams_dir.rglob(f'{team_name}.yaml'):
        config_path = path
        break

    if not config_path or not config_path.exists():
        return None

    try:
        config = yaml.safe_load(config_path.read_text())
        # Try note_taker first (new pattern), fall back to coordinator (legacy)
        note_taker_name = config['team']['workflow'].get('note_taker') or config['team']['workflow'].get('coordinator')
        if not note_taker_name:
            return None
        for agent in config['team']['agents']:
            if agent['name'] == note_taker_name:
                return agent.get('output_file', 'NOTES.md')
    except Exception as e:
        print(f"Error loading team config: {e}", file=sys.stderr)
        return None

    return None


def detect_status(content: str) -> tuple[str, str]:
    """Detect project status from notes file content.

    Status is determined by file content:
    - DELEGATED: Has Current Assignment section with Agent
    - PENDING: No active assignment

    Note: Full status (COMPLETE, etc.) is determined by backend via required headers.
    """
    # Check for active assignment
    if '## Current Assignment' in content and '**Agent**:' in content:
        # Extract agent name
        agent_match = re.search(r'\*\*Agent\*\*:\s*(\w+)', content)
        if agent_match:
            return f"DELEGATED to {agent_match.group(1)}", ""
        return "DELEGATED", ""

    return "PENDING (no assignment)", ""


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

    # Get note_taker file
    notes_file = get_note_taker_file(project_path)
    if not notes_file:
        print("Could not determine notes file from team config")
        print("Ensure .team file exists and team config is valid")
        sys.exit(1)

    print(f"**Notes file**: {notes_file}")
    print()

    notes_path = project_path / notes_file
    if not notes_path.exists():
        print(f"**Status:** PENDING (no {notes_file})")
        sys.exit(0)

    content = notes_path.read_text()
    status, note = detect_status(content)

    print(f"**Status:** {status}")
    if note:
        print(note)
    print()

    print("---")
    print(f"## {notes_file}")
    print()
    print(content)


if __name__ == "__main__":
    main()
