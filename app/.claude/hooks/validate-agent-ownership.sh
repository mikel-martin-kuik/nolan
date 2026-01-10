#!/bin/bash
#
# PreToolUse hook: Enforces agent file ownership restrictions.
#
# Exit codes:
#   0 - Allow write
#   2 - Block write (ownership violation)

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

# Get agent identity
get_agent_name() {
    if [[ -n "${TMUX:-}" ]]; then
        local session
        session=$(tmux display-message -p '#S' 2>/dev/null || echo "")
        if [[ "$session" =~ ^agent-([a-z]([a-z0-9-]*[a-z0-9])?)-([a-z]+)$ ]]; then
            local team="${BASH_REMATCH[1]}"
            local agent="${BASH_REMATCH[3]}"
            if [[ "$team" == "ralph" ]]; then
                echo "ralph"
            else
                echo "$agent"
            fi
            return
        fi
    fi
    if [[ -n "${AGENT_NAME:-}" ]]; then
        echo "$AGENT_NAME"
        return
    fi
    if [[ -n "${CLAUDE_AGENT:-}" ]]; then
        echo "$CLAUDE_AGENT"
        return
    fi
    echo ""
}

agent=$(get_agent_name)
filename=$(basename "$file_path")

# Python-based ownership validation with team config and error handling (B05)
# Pass variables via environment to avoid heredoc quoting issues
export HOOK_AGENT="$agent"
export HOOK_FILENAME="$filename"
export HOOK_FILE_PATH="$file_path"

python3 <<'PYTHON_EOF'
import sys, yaml, os
from pathlib import Path

try:
    # Read from environment (avoids shell quoting issues)
    agent = os.environ.get('HOOK_AGENT', '')
    filename = os.environ.get('HOOK_FILENAME', '')
    file_path_str = os.environ.get('HOOK_FILE_PATH', '')

    if not file_path_str:
        sys.exit(0)

    file_path = Path(file_path_str)

    # Handle unknown agent - block writes to any output files
    if not agent:
        # Get protected files from team config
        projects_dir = os.environ.get('PROJECTS_DIR', os.path.join(os.environ.get('HOME', ''), 'nolan', 'projects'))
        if str(file_path).startswith(projects_dir):
            relative = Path(str(file_path)[len(projects_dir):].lstrip('/'))
            project_name = relative.parts[0] if relative.parts else None
            if project_name:
                project_path = Path(projects_dir) / project_name
                team_file = project_path / '.team'
                if team_file.exists():
                    team_name = team_file.read_text().strip()
                    nolan_root = Path(os.environ.get('NOLAN_ROOT', ''))
                    if nolan_root:
                        config_path = Path(nolan_root) / 'teams' / f'{team_name}.yaml'
                        if config_path.exists():
                            config = yaml.safe_load(config_path.read_text())
                            # Build protected files list from agent output_files
                            protected = [a['output_file'] for a in config['team']['agents'] if a.get('output_file')]
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

        # Load team config (required)
        team_file = project_path / '.team'
        if not team_file.exists():
            sys.exit(0)  # Skip projects without .team file

        team_name = team_file.read_text().strip()
        nolan_root = Path(os.environ.get('NOLAN_ROOT', ''))
        if not nolan_root:
            sys.exit(0)  # Can't validate without NOLAN_ROOT

        # Search for team config in teams directory (supports subdirectories)
        config_path = None
        for path in (nolan_root / 'teams').rglob(f'{team_name}.yaml'):
            config_path = path
            break
        if config_path is None:
            sys.exit(0)  # Team config not found

        config = yaml.safe_load(config_path.read_text())

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
PYTHON_EOF

exit 0
