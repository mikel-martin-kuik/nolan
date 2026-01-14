#!/bin/bash
#
# PreToolUse hook: Validates handoff document structure before Write.
# NON-BLOCKING MODE: Warns but allows write to proceed.
#
# Exit codes:
#   0 - Allow write (always)
#
# Input (stdin): JSON with tool_name, tool_input
# Output (stderr): Validation warnings (non-blocking)

set -euo pipefail

# Read JSON input (may be empty)
data=$(cat) || true

# Exit early if no input
if [[ -z "$data" ]]; then
    exit 0
fi

# Extract tool name, file path and content
tool_name=$(echo "$data" | jq -r '.tool_name // ""') || true
file_path=$(echo "$data" | jq -r '.tool_input.file_path // ""') || true

# Get content based on tool type
if [[ "$tool_name" == "Write" ]]; then
    content=$(echo "$data" | jq -r '.tool_input.content // ""') || true
elif [[ "$tool_name" == "Edit" ]]; then
    # For Edit: read current file, apply edit, validate result
    old_string=$(echo "$data" | jq -r '.tool_input.old_string // ""') || true
    new_string=$(echo "$data" | jq -r '.tool_input.new_string // ""') || true
    if [[ -f "$file_path" ]] && [[ -n "$old_string" ]]; then
        current_content=$(cat "$file_path" 2>/dev/null) || true
        # Simulate the edit by replacing old with new
        content="${current_content//"$old_string"/"$new_string"}"
    else
        # New file or missing old_string - use new_string only
        content="$new_string"
    fi
else
    exit 0  # Unknown tool, skip validation
fi

# Skip if no file path or no content
if [[ -z "$file_path" ]] || [[ -z "$content" ]]; then
    exit 0
fi

# Function to check required sections
check_sections() {
    local content="$1"
    shift
    local missing=()

    for section in "$@"; do
        if ! echo "$content" | grep -q "$section"; then
            missing+=("$section")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "WARNING: Missing required sections:" >&2
        for m in "${missing[@]}"; do
            echo "  - $m" >&2
        done
        # Non-blocking: warn but allow write
        return 0
    fi
}

# Python-based section validation with team config (B05)
# Pass variables via environment to avoid heredoc quoting issues
export HOOK_FILE_PATH="$file_path"
export HOOK_CONTENT="$content"

python3 <<'PYTHON_EOF'
import sys, yaml, os
from pathlib import Path

try:
    # Read from environment (avoids shell quoting issues)
    file_path_str = os.environ.get('HOOK_FILE_PATH', '')
    content = os.environ.get('HOOK_CONTENT', '')

    if not file_path_str:
        sys.exit(0)

    file_path = Path(file_path_str)
    filename = file_path.name

    # Load team config (required)
    docs_path = file_path.parent
    team_file = docs_path / '.team'
    if not team_file.exists():
        sys.exit(0)  # Skip projects without .team file

    # Parse team name (supports YAML and plain text formats)
    team_content = team_file.read_text()
    try:
        data = yaml.safe_load(team_content)
        if isinstance(data, dict) and 'team' in data:
            team_name = data['team']
        else:
            team_name = team_content.strip()
    except:
        team_name = team_content.strip()

    nolan_data_root = Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))

    config_path = nolan_data_root / 'teams' / team_name / 'team.yaml'
    if not config_path.exists():
        sys.exit(0)  # Team config not found

    config = yaml.safe_load(config_path.read_text())

    # Find agent config by output filename (includes coordinator)
    agent_config = next((a for a in config['team']['agents'] if a.get('output_file') == filename), None)

    if not agent_config:
        sys.exit(0)  # Not a tracked output file

    # Validate required sections
    missing = [s for s in agent_config.get('required_sections', []) if s not in content]

    if missing:
        print("WARNING: Missing required sections:", file=sys.stderr)
        for section in missing:
            print(f"  - {section}", file=sys.stderr)
        # Non-blocking: warn but allow write
        sys.exit(0)

except Exception as e:
    print(f"WARNING: Hook validation error: {e}", file=sys.stderr)
    # Non-blocking: allow write on error
    sys.exit(0)
PYTHON_EOF

# All checks passed
exit 0
