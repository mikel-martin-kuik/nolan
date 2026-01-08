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

# Workflow agent list
workflow_agents="ana bill carl enzo frank"
is_workflow_agent=false
for wa in $workflow_agents; do
    if [[ "$agent_name" == "$wa" ]]; then
        is_workflow_agent=true
        break
    fi
done

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

    if [[ "$file_path" =~ /scripts/(handoff-ack|coordinator-heartbeat|assign)\.sh$ ]]; then
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

# Team configs
teams_dir="$nolan_root/teams"

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
