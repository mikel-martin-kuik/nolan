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

config_path = Path(nolan_root) / "teams" / f"{team_name}.yaml"
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

config_path = Path(nolan_root) / "teams" / f"{team_name}.yaml"
config = yaml.safe_load(config_path.read_text())
print(config["team"]["workflow"]["coordinator"])
'
}

# Get team name from project path
# Usage: team=$(get_team_name "/path/to/project")
get_team_name() {
    local project_path="$1"
    local team_file="$project_path/.team"

    if [[ ! -f "$team_file" ]]; then
        echo "Error: .team file not found at $team_file" >&2
        return 1
    fi
    cat "$team_file"
}
