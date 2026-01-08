#!/bin/bash
#
# PreToolUse hook: Validates handoff document structure before Write.
#
# Exit codes:
#   0 - Allow write
#   2 - Block write (missing sections)
#
# Input (stdin): JSON with tool_name, tool_input
# Output (stderr): Error message on block

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
    # For Edit tool, validate the new content being written
    content=$(echo "$data" | jq -r '.tool_input.new_string // ""') || true
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
        echo "Missing required sections:" >&2
        for m in "${missing[@]}"; do
            echo "  - $m" >&2
        done
        exit 2
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

    team_name = team_file.read_text().strip()
    nolan_root = Path(os.environ.get('NOLAN_ROOT', ''))
    if not nolan_root:
        sys.exit(0)  # Can't validate without NOLAN_ROOT

    config_path = nolan_root / 'teams' / f'{team_name}.yaml'
    if not config_path.exists():
        sys.exit(0)  # Team config not found

    config = yaml.safe_load(config_path.read_text())

    # Get coordinator's output file from config
    coordinator_name = config['team']['workflow']['coordinator']
    coordinator_agent = next((a for a in config['team']['agents'] if a['name'] == coordinator_name), None)
    coordinator_file = coordinator_agent['output_file'] if coordinator_agent else None

    # Special handling for coordinator's output file
    if coordinator_file and filename == coordinator_file:
        # Accept either "## Log" or "## Handoff Log"
        if not ('## Handoff Log' in content or '## Log' in content):
            print("Missing required sections:", file=sys.stderr)
            print("  - ## Handoff Log (or ## Log)", file=sys.stderr)
            sys.exit(2)

        # Still check for Current Status
        if '## Current Status' not in content:
            print("Missing required sections:", file=sys.stderr)
            print("  - ## Current Status", file=sys.stderr)
            sys.exit(2)

        # Warn if content indicates completion but lacks structured marker
        import re
        if re.search(r'\*\*(Status|Phase)\*?\*?:.*\b(COMPLETE|CLOSED|DEPLOYED|PRODUCTION.READY)\b', content, re.IGNORECASE):
            if '<!-- PROJECT:STATUS:' not in content:
                print("SUGGESTION: Project appears complete but lacks structured marker.", file=sys.stderr)
                print("  Add: <!-- PROJECT:STATUS:COMPLETE:YYYY-MM-DD -->", file=sys.stderr)
                print("  This improves status detection reliability.", file=sys.stderr)

        sys.exit(0)

    # Find agent config by output filename
    agent_config = next((a for a in config['team']['agents'] if a.get('output_file') == filename), None)

    if not agent_config:
        sys.exit(0)  # Not a tracked output file

    # Validate required sections
    missing = [s for s in agent_config.get('required_sections', []) if s not in content]

    if missing:
        print("Missing required sections:", file=sys.stderr)
        for section in missing:
            print(f"  - {section}", file=sys.stderr)
        sys.exit(2)

except Exception as e:
    print(f"FATAL: Hook error: {e}", file=sys.stderr)
    sys.exit(2)
PYTHON_EOF

# All checks passed
exit 0
