#!/bin/bash
#
# PreToolUse hook: Enforces agent file ownership and restrictions.
#
# Ownership rules:
#   ana   → research.md only (in projects dir)
#   bill  → plan.md only (in projects dir)
#   enzo  → qa-review.md only (in projects dir)
#   carl  → permissive (implementation files)
#   dan   → permissive (coordination files)
#   ralph → RESTRICTED: no projects dir, no protected files
#
# Exit codes:
#   0 - Allow write
#   2 - Block write (ownership violation)

set -euo pipefail

# Read JSON input
data=$(cat)

# Extract file path
file_path=$(echo "$data" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [[ -z "$file_path" ]]; then
    exit 0
fi

# Detect agent from tmux session name
get_agent_name() {
    # Try tmux session name first
    if [[ -n "${TMUX:-}" ]]; then
        local session
        session=$(tmux display-message -p '#S' 2>/dev/null || echo "")
        # Extract agent name: agent-ana, agent-bill-2, etc.
        if [[ "$session" =~ ^agent-([a-z]+)(-[0-9]+)?$ ]]; then
            echo "${BASH_REMATCH[1]}"
            return
        fi
    fi
    # Fallback: check AGENT_NAME (team standard) or CLAUDE_AGENT env var
    if [[ -n "${AGENT_NAME:-}" ]]; then
        echo "$AGENT_NAME"
        return
    fi
    if [[ -n "${CLAUDE_AGENT:-}" ]]; then
        echo "$CLAUDE_AGENT"
        return
    fi
    # Unknown agent - return empty to trigger validation
    echo ""
}

agent=$(get_agent_name)
filename=$(basename "$file_path")

# Python-based ownership validation with team config and error handling (B05)
python3 <<'EOF'
import sys, yaml, os
from pathlib import Path

try:
    agent = '''${agent}'''
    filename = '''${filename}'''
    file_path = Path('''${file_path}''')

    # Handle unknown agent - block writes to any output files
    if not agent:
        # Block writes to common output files if agent is unknown
        protected = ['research.md', 'plan.md', 'progress.md', 'qa-review.md', 'NOTES.md']
        if filename in protected:
            print(f"BLOCKED: Unknown agent cannot write to {filename}. Set AGENT_NAME environment variable.", file=sys.stderr)
            sys.exit(2)
        sys.exit(0)  # Allow other files

    # Determine if this is a project file
    projects_dir = os.environ.get('PROJECTS_DIR', os.path.join(os.environ.get('HOME', ''), 'nolan', 'projects'))

    # If not in projects directory, allow (app code, scripts, etc.)
    if str(file_path).startswith(projects_dir):
        # Extract project path from file path
        relative = Path(str(file_path)[len(projects_dir):].lstrip('/'))
        project_name = relative.parts[0] if relative.parts else None

        if project_name:
            project_path = Path(projects_dir) / project_name
        else:
            # Edge case: writing directly to projects dir
            sys.exit(0)

        # Load team config with fallback (B05)
        team_file = project_path / '.team'
        team_name = team_file.read_text().strip() if team_file.exists() else 'default'

        nolan_root = Path(os.environ['NOLAN_ROOT'])
        config_path = nolan_root / 'teams' / f'{team_name}.yaml'

        try:
            config = yaml.safe_load(config_path.read_text())
        except Exception as e:
            print(f"Warning: Failed to load team config '{team_name}': {e}", file=sys.stderr)
            print("Falling back to default team", file=sys.stderr)
            config = yaml.safe_load((nolan_root / 'teams' / 'default.yaml').read_text())

        # Find agent configuration
        agent_config = next((a for a in config['team']['agents'] if a['name'] == agent), None)

        if not agent_config:
            print(f"BLOCKED: Unknown agent '{agent}' not in team config", file=sys.stderr)
            sys.exit(2)

        # Enforce file permissions
        perms = agent_config.get('file_permissions')

        if perms == 'no_projects':
            print(f"BLOCKED: {agent} cannot write to projects directory: {file_path}", file=sys.stderr)
            sys.exit(2)

        if perms == 'restricted':
            allowed_file = agent_config.get('output_file')
            if filename != allowed_file:
                print(f"BLOCKED: {agent} can only write to {allowed_file}, not {filename}", file=sys.stderr)
                sys.exit(2)

        # perms == 'permissive' allows all writes

    # All checks passed
    sys.exit(0)

except Exception as e:
    print(f"FATAL: Hook error: {e}", file=sys.stderr)
    sys.exit(2)
EOF

exit 0
