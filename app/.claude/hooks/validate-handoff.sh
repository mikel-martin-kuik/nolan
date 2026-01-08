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

# Read JSON input
data=$(cat)

# Extract file path and content
file_path=$(echo "$data" | jq -r '.tool_input.file_path // empty')
content=$(echo "$data" | jq -r '.tool_input.content // empty')

# Skip if not a handoff document
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
python3 <<'EOF'
import sys, yaml, os
from pathlib import Path

try:
    file_path = Path('''${file_path}''')
    filename = file_path.name

    # Load team config (required)
    docs_path = file_path.parent
    team_file = docs_path / '.team'
    if not team_file.exists():
        sys.exit(0)  # Skip projects without .team file

    team_name = team_file.read_text().strip()
    nolan_root = Path(os.environ['NOLAN_ROOT'])
    config_path = nolan_root / 'teams' / f'{team_name}.yaml'
    config = yaml.safe_load(config_path.read_text())

    # Get coordinator's output file from config
    coordinator_name = config['team']['workflow']['coordinator']
    coordinator_agent = next((a for a in config['team']['agents'] if a['name'] == coordinator_name), None)
    coordinator_file = coordinator_agent['output_file'] if coordinator_agent else None

    # Special handling for coordinator's output file
    if coordinator_file and filename == coordinator_file:
        content = '''${content}'''

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
                print(f"  Add: <!-- PROJECT:STATUS:COMPLETE:$(date +%Y-%m-%d) -->", file=sys.stderr)
                print("  This improves status detection reliability.", file=sys.stderr)

        sys.exit(0)

    # Find agent config by output filename
    agent_config = next((a for a in config['team']['agents'] if a.get('output_file') == filename), None)

    if not agent_config:
        sys.exit(0)  # Not a tracked output file

    # Validate required sections
    content = '''${content}'''
    missing = [s for s in agent_config.get('required_sections', []) if s not in content]

    if missing:
        print("Missing required sections:", file=sys.stderr)
        for section in missing:
            print(f"  - {section}", file=sys.stderr)
        sys.exit(2)

except Exception as e:
    print(f"FATAL: Hook error: {e}", file=sys.stderr)
    sys.exit(2)
EOF

# All checks passed
exit 0
