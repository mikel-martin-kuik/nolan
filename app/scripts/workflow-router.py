#!/usr/bin/env python3
"""
Workflow Router - Routes workflow phases based on completion/rejection decisions.

Usage:
    workflow-router.py <project-path> <current-phase> [decision]

Arguments:
    project-path   Path to the project directory
    current-phase  Name of the phase just completed
    decision       "approved" (default) or "rejected"

Output (JSON to stdout):
    {
        "action": "assign" | "complete" | "escalate",
        "next_phase": "Planning",
        "next_agent": "bill",
        "reason": "Auto-progressing from Research"
    }

Exit codes:
    0 - Success
    1 - Error (JSON error output to stdout)
"""
import json
import sys
import os
from pathlib import Path
from typing import Optional

try:
    import yaml
except ImportError:
    print(json.dumps({
        "action": "escalate",
        "reason": "PyYAML not installed"
    }))
    sys.exit(1)


def log_stderr(msg: str):
    """Write message to stderr for debugging."""
    sys.stderr.write(f"[workflow-router] {msg}\n")
    sys.stderr.flush()


def output_result(action: str, next_phase: Optional[str] = None,
                  next_agent: Optional[str] = None, reason: str = ""):
    """Output result as JSON and exit."""
    result = {
        "action": action,
        "reason": reason
    }
    if next_phase:
        result["next_phase"] = next_phase
    if next_agent:
        result["next_agent"] = next_agent
    print(json.dumps(result))
    sys.exit(0)


def output_error(reason: str):
    """Output error as JSON and exit with code 1."""
    print(json.dumps({
        "action": "escalate",
        "reason": reason
    }))
    sys.exit(1)


def parse_team_name(team_file: Path) -> str:
    """Parse team name from .team file (supports YAML and plain text formats)."""
    content = team_file.read_text()
    try:
        data = yaml.safe_load(content)
        if isinstance(data, dict) and 'team' in data:
            return data['team']
        else:
            return content.strip()
    except Exception:
        return content.strip()


def load_team_config(project_path: Path) -> dict:
    """Load team configuration for a project.

    Returns team config dict or raises exception.
    """
    team_file = project_path / '.team'
    if not team_file.exists():
        raise FileNotFoundError(f".team file not found in {project_path}")

    team_name = parse_team_name(team_file)

    # Use NOLAN_DATA_ROOT for data directories (with fallback to ~/.nolan)
    nolan_data_root = os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan'))

    # Team config format: teams/{team_name}/team.yaml
    config_path = Path(nolan_data_root) / 'teams' / team_name / 'team.yaml'
    if not config_path.exists():
        raise FileNotFoundError(f"Team config not found: {team_name}")

    with open(config_path) as f:
        config = yaml.safe_load(f)

    return config


def get_phase_by_name(phases: list, name: str) -> Optional[dict]:
    """Find phase by name (case-insensitive)."""
    for phase in phases:
        if phase.get('name', '').lower() == name.lower():
            return phase
    return None


def get_agent_for_phase(team_config: dict, phase_name: str) -> Optional[str]:
    """Get the agent that owns a phase."""
    phases = team_config.get('team', {}).get('workflow', {}).get('phases', [])
    phase = get_phase_by_name(phases, phase_name)
    if phase:
        return phase.get('owner')
    return None


def main():
    # Parse arguments
    if len(sys.argv) < 3:
        output_error("Usage: workflow-router.py <project-path> <current-phase> [decision]")

    project_path = Path(sys.argv[1])
    current_phase_name = sys.argv[2]
    decision = sys.argv[3] if len(sys.argv) > 3 else "approved"

    # Validate decision
    if decision not in ("approved", "rejected"):
        output_error(f"Invalid decision: {decision}. Must be 'approved' or 'rejected'.")

    # Validate project path
    if not project_path.exists():
        output_error(f"Project path does not exist: {project_path}")

    # Load team config
    try:
        team_config = load_team_config(project_path)
    except FileNotFoundError as e:
        output_error(str(e))
    except Exception as e:
        output_error(f"Failed to load team config: {e}")

    # Check schema version
    schema_version = team_config.get('team', {}).get('schema_version', 1)
    if schema_version < 2:
        output_result(
            action="escalate",
            reason=f"Team config schema_version is {schema_version} (requires >= 2 for auto-routing)"
        )

    # Get phases
    phases = team_config.get('team', {}).get('workflow', {}).get('phases', [])
    if not phases:
        output_error("No phases defined in team config")

    # Find current phase and its index
    current_phase = None
    current_index = -1
    for i, phase in enumerate(phases):
        if phase.get('name', '').lower() == current_phase_name.lower():
            current_phase = phase
            current_index = i
            break

    if not current_phase:
        available = [p.get('name', '') for p in phases]
        output_error(f"Phase '{current_phase_name}' not found. Available: {available}")

    # Route based on decision
    if decision == "rejected":
        # Rejection goes to previous phase in sequence
        if current_index <= 0:
            # First phase - nowhere to go back to
            output_result(
                action="escalate",
                reason=f"Phase '{current_phase_name}' rejected but it's the first phase"
            )
        else:
            prev_phase = phases[current_index - 1]
            prev_phase_name = prev_phase.get('name')
            prev_agent = prev_phase.get('owner')
            if not prev_agent:
                output_error(f"Previous phase '{prev_phase_name}' has no owner defined")
            output_result(
                action="assign",
                next_phase=prev_phase_name,
                next_agent=prev_agent,
                reason=f"Rejected from {current_phase_name}, routing back to {prev_phase_name}"
            )

    else:  # approved
        # Derive next phase from array position (last phase is terminal)
        if current_index >= len(phases) - 1:
            # Terminal phase - workflow complete
            output_result(
                action="complete",
                reason=f"Phase '{current_phase_name}' is terminal (last in sequence)"
            )
        else:
            # Route to next phase in sequence
            next_phase = phases[current_index + 1]
            next_phase_name = next_phase.get('name')
            next_agent = next_phase.get('owner')
            if not next_agent:
                output_error(f"Next phase '{next_phase_name}' has no owner defined")
            output_result(
                action="assign",
                next_phase=next_phase_name,
                next_agent=next_agent,
                reason=f"Auto-progressing from {current_phase_name} to {next_phase_name}"
            )


if __name__ == "__main__":
    main()
