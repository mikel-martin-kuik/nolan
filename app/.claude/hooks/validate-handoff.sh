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

# Python-based section validation with team config and error handling (B05)
python3 <<'EOF'
import sys, yaml, os
from pathlib import Path

try:
    file_path = Path('''${file_path}''')

    # Special handling for NOTES.md (coordinator file - not in team config)
    if file_path.name == 'NOTES.md':
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

    # Load team config for other files
    docs_path = file_path.parent
    team_file = docs_path / '.team'
    team_name = team_file.read_text().strip() if team_file.exists() else 'default'

    nolan_root = Path(os.environ['NOLAN_ROOT'])
    config_path = nolan_root / 'teams' / f'{team_name}.yaml'

    # Load config with fallback to default team (B05)
    try:
        config = yaml.safe_load(config_path.read_text())
    except Exception as e:
        print(f"Warning: Failed to load team config '{team_name}': {e}", file=sys.stderr)
        print("Falling back to default team", file=sys.stderr)
        config = yaml.safe_load((nolan_root / 'teams' / 'default.yaml').read_text())

    # Find agent config by output filename
    filename = file_path.name
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
