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
team_name="${TEAM_NAME:-default}"

# Check if agent is a workflow participant (dynamically from team config)
# Note: Ralph is NOT restricted - support agents need infrastructure access
# Use NOLAN_DATA_ROOT for data directories (with fallback to ~/.nolan)
nolan_data_root="${NOLAN_DATA_ROOT:-$HOME/.nolan}"
is_restricted=false
if [[ -n "$nolan_data_root" ]] && [[ -n "$agent_name" ]]; then
    # Ralph agents are never restricted
    if [[ "$agent_name" == "ralph" ]] || [[ "$agent_name" =~ ^ralph- ]]; then
        is_restricted=false
    else
        workflow_check=$(python3 -c "
import yaml, sys
from pathlib import Path
import os

nolan_data_root = Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))
team_name = '$team_name'
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
        [[ "$workflow_check" == "yes" ]] && is_restricted=true
    fi
fi

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
# Includes common bypass methods: hex/binary viewers, dd, base64, tee, etc.
read_commands='(cat|head|tail|less|more|bat|view|vim|nano|sed|awk|grep|rg|xargs|find.*-exec|xxd|strings|od|hexdump|dd|base64|tee|nl|pr|fold|cut|paste|rev|tac|sort|uniq|wc.*-c)'

# Check if command reads a sensitive file
for pattern in "${sensitive_patterns[@]}"; do
    # Check if command contains both a read command and a sensitive path
    if echo "$command" | grep -qE "$read_commands" && echo "$command" | grep -qE "$pattern"; then
        echo "BLOCKED: Cannot read infrastructure files." >&2
        exit 2
    fi
done

# Block Python file read attempts (multiple methods)
# Covers: open(), pathlib, subprocess, exec/compile, importlib
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
    'python.*subprocess'
    'python3.*subprocess'
    'python.*exec\('
    'python3.*exec\('
    'python.*compile\('
    'python3.*compile\('
    'python.*__import__'
    'python3.*__import__'
    'python.*importlib'
    'python3.*importlib'
    'python.*runpy'
    'python3.*runpy'
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

# Block copy-then-read bypass attempts
# Catches: cp file /tmp && cat /tmp/file, mv file /tmp, ln -s file /tmp
if echo "$command" | grep -qE '(cp|mv|ln).*\.claude/|cp.*teams/.*\.yaml|cp.*handoff-ack|cp.*coordinator-heartbeat'; then
    echo "BLOCKED: Cannot copy infrastructure files." >&2
    exit 2
fi

# Block command substitution bypasses
# Catches: cat $(echo .claude/hooks/file), < $(find .claude -name "*.sh")
if echo "$command" | grep -qE '\$\(.*\.claude|\$\(.*teams/.*\.yaml|\$\(.*handoff'; then
    echo "BLOCKED: Cannot access infrastructure files." >&2
    exit 2
fi

# Block curl/wget file:// protocol
if echo "$command" | grep -qE '(curl|wget).*file://'; then
    echo "BLOCKED: Cannot use file:// protocol." >&2
    exit 2
fi

exit 0
