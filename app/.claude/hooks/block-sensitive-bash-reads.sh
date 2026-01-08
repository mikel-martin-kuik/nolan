#!/bin/bash
#
# PreToolUse hook: Blocks Bash commands that read sensitive infrastructure files.
#
# Prevents agents from using cat/head/tail/less to bypass Read tool restrictions.
#
# Exit codes:
#   0 - Allow command
#   2 - Block command (sensitive file access)

set -euo pipefail

# Read JSON input
data=$(cat) || true

if [[ -z "$data" ]]; then
    exit 0
fi

# Extract command
command=$(echo "$data" | jq -r '.tool_input.command // ""') || true

if [[ -z "$command" ]]; then
    exit 0
fi

# Get agent info
agent_name="${AGENT_NAME:-}"
nolan_root="${NOLAN_ROOT:-}"

# Define workflow agents who have restricted access
# Note: Ralph is NOT restricted - support agents need infrastructure access
workflow_agents="ana bill carl enzo frank"
is_restricted=false
for wa in $workflow_agents; do
    if [[ "$agent_name" == "$wa" ]]; then
        is_restricted=true
        break
    fi
done

# Only apply restrictions to workflow agents
if [[ "$is_restricted" != true ]]; then
    exit 0
fi

# Patterns for sensitive paths
sensitive_patterns=(
    '\.claude/hooks/'
    '\.claude/settings\.json'
    '/scripts/handoff-ack'
    '/scripts/coordinator-heartbeat'
    '/teams/.*\.yaml'
    'validate-phase-complete'
    'validate-handoff'
    'validate-agent-ownership'
    'block-.*\.sh'
    'preserve-state'
    'session-context'
)

# Commands that read file contents
read_commands='(cat|head|tail|less|more|bat|view|vim|nano|sed|awk|grep|rg|xargs|find.*-exec)'

# Check if command reads a sensitive file
for pattern in "${sensitive_patterns[@]}"; do
    # Check if command contains both a read command and a sensitive path
    if echo "$command" | grep -qE "$read_commands" && echo "$command" | grep -qE "$pattern"; then
        echo "BLOCKED: Cannot read infrastructure files." >&2
        exit 2
    fi
done

# Block Python file read attempts (multiple methods)
python_read_patterns=(
    'python.*open\('
    'python.*read\('
    'python.*Path\(.*read_'
    'python.*pathlib.*read'
    'python3.*open\('
    'python3.*read\('
    'python3.*Path\(.*read_'
    'python3.*pathlib.*read'
    'python.*<'        # stdin redirection
    'python3.*<'
)

sensitive_file_patterns='hooks|settings\.json|handoff-ack|coordinator-heartbeat|teams/.*\.yaml'

for py_pattern in "${python_read_patterns[@]}"; do
    if echo "$command" | grep -qE "$py_pattern" && echo "$command" | grep -qE "$sensitive_file_patterns"; then
        echo "BLOCKED: Cannot read infrastructure files." >&2
        exit 2
    fi
done

# Block shell redirections to read sensitive files
if echo "$command" | grep -qE '<.*\.claude/|<.*teams/.*\.yaml|<.*handoff-ack|<.*coordinator-heartbeat'; then
    echo "BLOCKED: Cannot read infrastructure files." >&2
    exit 2
fi

exit 0
