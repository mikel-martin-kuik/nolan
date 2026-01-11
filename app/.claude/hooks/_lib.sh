#!/bin/bash
# Shared helper functions for hooks
# Source this file: source "$(dirname "$0")/_lib.sh"

# Get team name from project path
# Supports both YAML format (team: name) and plain text format
# Usage: team=$(get_team_name "/path/to/project")
get_team_name() {
    local project_path="$1"
    local team_file="$project_path/.team"

    if [[ ! -f "$team_file" ]]; then
        echo "Error: .team file not found at $team_file" >&2
        return 1
    fi

    # Parse team name (supports YAML and plain text)
    python3 -c "
import yaml
from pathlib import Path

content = Path('$team_file').read_text()
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        print(data['team'])
    else:
        print(content.strip())
except:
    print(content.strip())
" 2>/dev/null || cat "$team_file" | head -1
}

# Get note taker's output file from team config (replaces coordinator pattern)
# Usage: notes_file=$(get_note_taker_file "/path/to/project")
get_note_taker_file() {
    local project_path="$1"
    local team_name

    # NOLAN_ROOT is required
    if [[ -z "${NOLAN_ROOT:-}" ]]; then
        echo "Error: NOLAN_ROOT environment variable is not set" >&2
        return 1
    fi

    # Use NOLAN_DATA_ROOT for teams (with fallback to NOLAN_ROOT)
    local data_root="${NOLAN_DATA_ROOT:-$HOME/.nolan}"

    # Get team name using YAML-aware parser
    team_name=$(get_team_name "$project_path") || return 1

    # Query team config for note_taker's output file
    HOOK_DATA_ROOT="$data_root" HOOK_TEAM_NAME="$team_name" python3 -c '
import yaml, os
from pathlib import Path

data_root = os.environ["HOOK_DATA_ROOT"]
team_name = os.environ["HOOK_TEAM_NAME"]

teams_dir = Path(data_root) / "teams"
config_path = None
for path in teams_dir.rglob(f"{team_name}.yaml"):
    config_path = path
    break

if config_path is None:
    print(f"Error: Team config not found for {team_name}", file=__import__("sys").stderr)
    exit(1)

config = yaml.safe_load(config_path.read_text())
# Try note_taker first (new pattern), fall back to coordinator (legacy)
note_taker = config["team"]["workflow"].get("note_taker") or config["team"]["workflow"].get("coordinator")
if not note_taker:
    print("Error: No note_taker or coordinator defined in team config", file=__import__("sys").stderr)
    exit(1)

for agent in config["team"]["agents"]:
    if agent["name"] == note_taker:
        print(agent.get("output_file", "NOTES.md"))
        break
'
}

# Legacy alias for backwards compatibility
get_coordinator_file() {
    get_note_taker_file "$@"
}

# Get note taker name from team config (replaces coordinator pattern)
# Usage: note_taker=$(get_note_taker_name "/path/to/project")
get_note_taker_name() {
    local project_path="$1"
    local team_name

    # NOLAN_ROOT is required
    if [[ -z "${NOLAN_ROOT:-}" ]]; then
        echo "Error: NOLAN_ROOT environment variable is not set" >&2
        return 1
    fi

    # Use NOLAN_DATA_ROOT for teams (with fallback to NOLAN_ROOT)
    local data_root="${NOLAN_DATA_ROOT:-$HOME/.nolan}"

    # Get team name using YAML-aware parser
    team_name=$(get_team_name "$project_path") || return 1

    # Query team config for note_taker name
    HOOK_DATA_ROOT="$data_root" HOOK_TEAM_NAME="$team_name" python3 -c '
import yaml, os
from pathlib import Path

data_root = os.environ["HOOK_DATA_ROOT"]
team_name = os.environ["HOOK_TEAM_NAME"]

teams_dir = Path(data_root) / "teams"
config_path = None
for path in teams_dir.rglob(f"{team_name}.yaml"):
    config_path = path
    break

if config_path is None:
    print(f"Error: Team config not found for {team_name}", file=__import__("sys").stderr)
    exit(1)

config = yaml.safe_load(config_path.read_text())
# Try note_taker first (new pattern), fall back to coordinator (legacy)
note_taker = config["team"]["workflow"].get("note_taker") or config["team"]["workflow"].get("coordinator")
if not note_taker:
    print("Error: No note_taker or coordinator defined in team config", file=__import__("sys").stderr)
    exit(1)
print(note_taker)
'
}

# Legacy alias for backwards compatibility
get_coordinator_name() {
    get_note_taker_name "$@"
}

# Get next agent for handoff based on workflow phases
# Usage: next_agent=$(get_next_agent "/path/to/project" "current_agent")
# Returns: next agent name, or empty if workflow complete
get_next_agent() {
    local project_path="$1"
    local current_agent="$2"
    local team_name

    # NOLAN_ROOT is required
    if [[ -z "${NOLAN_ROOT:-}" ]]; then
        echo "Error: NOLAN_ROOT environment variable is not set" >&2
        return 1
    fi

    # Use NOLAN_DATA_ROOT for teams (with fallback to NOLAN_ROOT)
    local data_root="${NOLAN_DATA_ROOT:-$HOME/.nolan}"

    # Get team name using YAML-aware parser
    team_name=$(get_team_name "$project_path") || return 1

    # Query team config for next agent in workflow
    HOOK_DATA_ROOT="$data_root" HOOK_TEAM_NAME="$team_name" HOOK_CURRENT_AGENT="$current_agent" python3 -c '
import yaml, os
from pathlib import Path

data_root = os.environ["HOOK_DATA_ROOT"]
team_name = os.environ["HOOK_TEAM_NAME"]
current_agent = os.environ["HOOK_CURRENT_AGENT"]

teams_dir = Path(data_root) / "teams"
config_path = None
for path in teams_dir.rglob(f"{team_name}.yaml"):
    config_path = path
    break

if config_path is None:
    exit(0)  # Return empty on error

config = yaml.safe_load(config_path.read_text())
phases = config.get("team", {}).get("workflow", {}).get("phases", [])

# Find current agent phase and get next
for phase in phases:
    if phase.get("owner") == current_agent:
        next_phase_name = phase.get("next")
        if not next_phase_name:
            # Workflow complete
            exit(0)
        # Find owner of next phase
        for next_phase in phases:
            if next_phase.get("name") == next_phase_name:
                print(next_phase.get("owner", ""))
                exit(0)
        break
'
}

# Check if agent is a workflow participant (vs support/utility agent)
# Usage: if is_workflow_participant "/path/to/project" "agent_name"; then ...
is_workflow_participant() {
    local project_path="$1"
    local agent_name="$2"
    local team_name

    # NOLAN_ROOT is required
    if [[ -z "${NOLAN_ROOT:-}" ]]; then
        return 1
    fi

    # Use NOLAN_DATA_ROOT for teams (with fallback to NOLAN_ROOT)
    local data_root="${NOLAN_DATA_ROOT:-$HOME/.nolan}"

    # Get team name using YAML-aware parser
    team_name=$(get_team_name "$project_path") || return 1

    HOOK_DATA_ROOT="$data_root" HOOK_TEAM_NAME="$team_name" HOOK_AGENT="$agent_name" python3 -c '
import yaml, os
from pathlib import Path

data_root = os.environ["HOOK_DATA_ROOT"]
team_name = os.environ["HOOK_TEAM_NAME"]
agent_name = os.environ["HOOK_AGENT"]

teams_dir = Path(data_root) / "teams"
config_path = None
for path in teams_dir.rglob(f"{team_name}.yaml"):
    config_path = path
    break

if config_path is None:
    exit(1)

config = yaml.safe_load(config_path.read_text())
for agent in config.get("team", {}).get("agents", []):
    if agent.get("name") == agent_name:
        if agent.get("workflow_participant", True):
            exit(0)
        else:
            exit(1)
exit(1)
'
}
