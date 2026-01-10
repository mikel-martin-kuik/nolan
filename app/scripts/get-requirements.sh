#!/bin/bash
#
# Get required sections for an agent's output file.
#
# Usage: get-requirements.sh <agent-name> [team-name]
#
# Examples:
#   get-requirements.sh ana
#   get-requirements.sh dan default
#

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: get-requirements.sh <agent-name> [team-name]" >&2
    exit 1
fi

AGENT_NAME="$1"
TEAM_NAME="${2:-default}"

# Find team config (supports subdirectories)
NOLAN_ROOT="${NOLAN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CONFIG_PATH=$(find "$NOLAN_ROOT/teams" -name "${TEAM_NAME}.yaml" -type f 2>/dev/null | head -1)

if [[ -z "$CONFIG_PATH" ]] || [[ ! -f "$CONFIG_PATH" ]]; then
    echo "Team config not found: $TEAM_NAME" >&2
    exit 1
fi

# Extract agent's output file and required sections
python3 - "$CONFIG_PATH" "$AGENT_NAME" <<'PYTHON_EOF'
import sys, yaml

config_path, agent_name = sys.argv[1], sys.argv[2]

with open(config_path) as f:
    config = yaml.safe_load(f)

agent = next((a for a in config['team']['agents'] if a['name'] == agent_name), None)

if not agent:
    print(f"Agent '{agent_name}' not found in team config", file=sys.stderr)
    sys.exit(1)

output_file = agent.get('output_file', 'N/A')
sections = agent.get('required_sections', [])

print(f"Output file: {output_file}")
print(f"Required sections:")
for s in sections:
    print(f"  {s}")
if not sections:
    print("  (none)")
PYTHON_EOF
