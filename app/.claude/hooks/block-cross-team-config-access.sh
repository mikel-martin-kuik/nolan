#!/bin/bash
#
# PreToolUse hook: Enforces file access restrictions.
#
# Exit codes:
#   0 - Allow read
#   2 - Block read (access violation)

set -euo pipefail

# Read JSON input (may be empty)
data=$(cat) || true

# Exit early if no input
if [[ -z "$data" ]]; then
    exit 0
fi

# Extract file path (use explicit empty string if missing)
file_path=$(echo "$data" | jq -r '.tool_input.file_path // ""') || true

# Skip if no file path
if [[ -z "$file_path" ]]; then
    exit 0
fi

# Normalize path to handle relative paths
file_path=$(realpath -m "$file_path" 2>/dev/null || echo "$file_path")

# Get paths
nolan_root="${NOLAN_ROOT:-}"
agent_dir="${AGENT_DIR:-}"
agent_name="${AGENT_NAME:-}"
agent_team="${TEAM_NAME:-}"

if [[ -z "$nolan_root" ]]; then
    exit 0
fi

# Check if agent is a workflow participant (dynamically from team config)
# Use NOLAN_DATA_ROOT for data directories (with fallback to ~/.nolan)
nolan_data_root="${NOLAN_DATA_ROOT:-$HOME/.nolan}"
is_workflow_agent=false
if [[ -n "$nolan_data_root" ]] && [[ -n "$agent_team" ]] && [[ -n "$agent_name" ]]; then
    workflow_check=$(python3 -c "
import yaml, sys
from pathlib import Path
import os

nolan_data_root = Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))
team_name = '$agent_team'
agent_name = '$agent_name'.lower()

config_path = nolan_data_root / 'teams' / team_name / 'team.yaml'
if not config_path.exists():
    sys.exit(0)

config = yaml.safe_load(config_path.read_text())
agents = config.get('team', {}).get('agents', [])

for agent in agents:
    if agent.get('name', '').lower() == agent_name:
        if agent.get('workflow_participant', False):
            print('yes')
        break
" 2>/dev/null)
    [[ "$workflow_check" == "yes" ]] && is_workflow_agent=true
fi

# Infrastructure files
if [[ "$is_workflow_agent" == true ]]; then
    if [[ "$file_path" =~ /.claude/hooks/ ]]; then
        echo "BLOCKED: Access restricted." >&2
        exit 2
    fi

    if [[ "$file_path" =~ /.claude/settings\.json$ ]]; then
        echo "BLOCKED: Access restricted." >&2
        exit 2
    fi

    if [[ "$file_path" =~ /.claude/commands/ ]]; then
        echo "BLOCKED: Access restricted." >&2
        exit 2
    fi

    if [[ "$file_path" =~ /scripts/(handoff-ack|assign)\.sh$ ]]; then
        echo "BLOCKED: Access restricted." >&2
        exit 2
    fi

    if [[ "$file_path" =~ block-cross-team-config-access\.sh$ ]]; then
        echo "BLOCKED: Access restricted." >&2
        exit 2
    fi
fi

# Agent directories
if [[ "$is_workflow_agent" == true ]]; then
    agents_dir="$nolan_root/app/agents"
    if [[ "$file_path" =~ ^"$agents_dir"/([^/]+)/ ]]; then
        target_agent="${BASH_REMATCH[1]}"
        if [[ "$target_agent" != "$agent_name" ]]; then
            echo "BLOCKED: Access restricted." >&2
            exit 2
        fi
    fi
fi

# Team configs - use NOLAN_DATA_ROOT for data directories
teams_dir="$nolan_data_root/teams"

if [[ "$file_path" =~ ^"$teams_dir"/.+\.yaml$ ]]; then
    target_team=$(basename "$file_path" .yaml)

    if [[ "$is_workflow_agent" == true ]]; then
        echo "BLOCKED: Access restricted." >&2
        exit 2
    fi

    if [[ -n "$agent_team" ]] && [[ "$target_team" != "$agent_team" ]]; then
        if [[ ! "$agent_name" == "ralph" ]] && [[ ! "$agent_name" =~ ^ralph- ]]; then
            echo "BLOCKED: Access restricted." >&2
            exit 2
        fi
    fi
fi

# All checks passed, allow read
exit 0
