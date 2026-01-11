#!/bin/bash
# Shared helper functions for hooks
# Source this file: source "$(dirname "$0")/_lib.sh"

# Get coordinator's output file from team config
# Usage: coordinator_file=$(get_coordinator_file "/path/to/project")
get_coordinator_file() {
    local project_path="$1"
    local team_file="$project_path/.team"
    local team_name

    # NOLAN_ROOT is required
    if [[ -z "${NOLAN_ROOT:-}" ]]; then
        echo "Error: NOLAN_ROOT environment variable is not set" >&2
        return 1
    fi

    # Read team name from .team file (required)
    if [[ ! -f "$team_file" ]]; then
        echo "Error: .team file not found at $team_file" >&2
        return 1
    fi
    team_name=$(cat "$team_file")

    # Query team config for coordinator's output file
    # Use environment variables to avoid shell injection
    HOOK_NOLAN_ROOT="$NOLAN_ROOT" HOOK_TEAM_NAME="$team_name" python3 -c '
import yaml, os
from pathlib import Path

nolan_root = os.environ["HOOK_NOLAN_ROOT"]
team_name = os.environ["HOOK_TEAM_NAME"]

# Search for team config in teams directory (supports subdirectories)
teams_dir = Path(nolan_root) / "teams"
config_path = None
for path in teams_dir.rglob(f"{team_name}.yaml"):
    config_path = path
    break

if config_path is None:
    print(f"Error: Team config not found for {team_name}", file=__import__("sys").stderr)
    exit(1)

config = yaml.safe_load(config_path.read_text())
coordinator = config["team"]["workflow"]["coordinator"]
for agent in config["team"]["agents"]:
    if agent["name"] == coordinator:
        print(agent["output_file"])
        break
'
}

# Get coordinator name from team config
# Usage: coordinator=$(get_coordinator_name "/path/to/project")
get_coordinator_name() {
    local project_path="$1"
    local team_file="$project_path/.team"
    local team_name

    # NOLAN_ROOT is required
    if [[ -z "${NOLAN_ROOT:-}" ]]; then
        echo "Error: NOLAN_ROOT environment variable is not set" >&2
        return 1
    fi

    # Read team name from .team file (required)
    if [[ ! -f "$team_file" ]]; then
        echo "Error: .team file not found at $team_file" >&2
        return 1
    fi
    team_name=$(cat "$team_file")

    # Query team config for coordinator name
    # Use environment variables to avoid shell injection
    HOOK_NOLAN_ROOT="$NOLAN_ROOT" HOOK_TEAM_NAME="$team_name" python3 -c '
import yaml, os
from pathlib import Path

nolan_root = os.environ["HOOK_NOLAN_ROOT"]
team_name = os.environ["HOOK_TEAM_NAME"]

# Search for team config in teams directory (supports subdirectories)
teams_dir = Path(nolan_root) / "teams"
config_path = None
for path in teams_dir.rglob(f"{team_name}.yaml"):
    config_path = path
    break

if config_path is None:
    print(f"Error: Team config not found for {team_name}", file=__import__("sys").stderr)
    exit(1)

config = yaml.safe_load(config_path.read_text())
print(config["team"]["workflow"]["coordinator"])
'
}

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
