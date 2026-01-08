#!/bin/bash
#
# assign.sh - Update Current Assignment section in coordinator's output file
#
# Usage:
#   assign.sh <project-name> <agent> <phase> <task-description>
#   assign.sh nolan-native-terminal enzo QA "Review Carl's implementation"
#
# This script:
# 1. Updates the Current Assignment section in coordinator's output file
# 2. Updates the Current Status section
# 3. Adds entry to Handoff Log
# 4. Sends minimal handoff message to agent
#

set -euo pipefail

# Validate arguments
if [[ $# -lt 4 ]]; then
    echo "Usage: assign.sh <project-name> <agent> <phase> <task-description>" >&2
    echo "Example: assign.sh nolan-native-terminal enzo QA 'Review implementation'" >&2
    exit 1
fi

PROJECT_NAME="$1"
AGENT="$2"
PHASE="$3"
TASK="$4"

# Get projects directory
PROJECTS_DIR="${PROJECTS_DIR:-${NOLAN_ROOT:-$HOME/nolan}/projects}"
PROJECT_DIR="$PROJECTS_DIR/$PROJECT_NAME"

# Validate project exists
if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "Error: Project directory not found: $PROJECT_DIR" >&2
    exit 1
fi

# Validate .team file exists
if [[ ! -f "$PROJECT_DIR/.team" ]]; then
    echo "Error: .team file not found in $PROJECT_DIR" >&2
    exit 1
fi

# Get coordinator from team config
get_coordinator() {
    local project_path="$1"

    python3 -c "
import yaml, os
from pathlib import Path

project_path = Path('$project_path')
team_name = (project_path / '.team').read_text().strip()
nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))
config = yaml.safe_load((nolan_root / 'teams' / f'{team_name}.yaml').read_text())
print(config['team']['workflow']['coordinator'])
"
}

# Get coordinator's output file from team config
get_coordinator_file() {
    local project_path="$1"

    python3 -c "
import yaml, os
from pathlib import Path

project_path = Path('$project_path')
team_name = (project_path / '.team').read_text().strip()
nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))
config = yaml.safe_load((nolan_root / 'teams' / f'{team_name}.yaml').read_text())
coordinator = config['team']['workflow']['coordinator']
for agent in config['team']['agents']:
    if agent['name'] == coordinator:
        print(agent['output_file'])
        break
"
}

COORDINATOR=$(get_coordinator "$PROJECT_DIR")
COORDINATOR_FILE=$(get_coordinator_file "$PROJECT_DIR")
NOTES_FILE="$PROJECT_DIR/$COORDINATOR_FILE"

# Validate coordinator file exists
if [[ ! -f "$NOTES_FILE" ]]; then
    echo "Error: Coordinator file not found: $NOTES_FILE" >&2
    exit 1
fi

# Generate timestamp and MSG_ID
# Format: MSG_<COORDINATOR>_<8-hex-chars>
TIMESTAMP=$(date +"%Y-%m-%d")
TIMESTAMP_FULL=$(date +"%Y-%m-%d %H:%M")
MSG_ID="MSG_${COORDINATOR^^}_$(openssl rand -hex 4)"

# Get agent's output file from team config
get_output_file() {
    local agent="$1"
    local project_path="$2"

    python3 -c "
import yaml, os
from pathlib import Path

project_path = Path('$project_path')
team_name = (project_path / '.team').read_text().strip()
nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))
config = yaml.safe_load((nolan_root / 'teams' / f'{team_name}.yaml').read_text())

for agent_config in config['team']['agents']:
    if agent_config['name'] == '$agent':
        print(agent_config['output_file'])
        break
"
}

OUTPUT_FILE=$(get_output_file "$AGENT" "$PROJECT_DIR")

# Get phase instructions from team config
get_phase_instructions() {
    local phase="$1"
    local project_path="$2"

    python3 -c "
import yaml, os
from pathlib import Path

project_path = Path('$project_path')
team_name = (project_path / '.team').read_text().strip()
nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))
config = yaml.safe_load((nolan_root / 'teams' / f'{team_name}.yaml').read_text())

for phase_config in config['team']['workflow']['phases']:
    if phase_config['name'] == '$phase':
        print(phase_config.get('template', 'Complete assigned work.'))
        break
else:
    print('Complete assigned work.')
"
}

INSTRUCTIONS=$(get_phase_instructions "$PHASE" "$PROJECT_DIR")

# Get predecessor files from phase config
get_predecessor_files() {
    local phase="$1"
    local project_path="$2"

    python3 -c "
import yaml, os
from pathlib import Path

project_path = Path('$project_path')
team_name = (project_path / '.team').read_text().strip()
nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))
config = yaml.safe_load((nolan_root / 'teams' / f'{team_name}.yaml').read_text())

for phase_config in config['team']['workflow']['phases']:
    if phase_config['name'] == '$phase':
        predecessor_files = phase_config.get('predecessor_files', [])
        for pf in predecessor_files:
            print(f\"- {pf['file']} - {pf['description']}\")
        break
" 2>/dev/null
}

PREDECESSOR_FILES=$(get_predecessor_files "$PHASE" "$PROJECT_DIR")

# Create assignment section
read -r -d '' ASSIGNMENT_SECTION <<EOF || true
## Current Assignment

**Agent**: ${AGENT^}
**Task**: $TASK
**Phase**: $PHASE
**Assigned**: $TIMESTAMP ($MSG_ID)

### Instructions

$INSTRUCTIONS

### Files to Review

- context.md - Project overview and objectives
EOF

# Add predecessor files from config
if [[ -n "$PREDECESSOR_FILES" ]]; then
    ASSIGNMENT_SECTION+=$'\n'"$PREDECESSOR_FILES"
fi

# Add focus areas (read from args or use defaults)
ASSIGNMENT_SECTION+=$'\n'
ASSIGNMENT_SECTION+=$'\n'"### Focus Areas"
ASSIGNMENT_SECTION+=$'\n'
ASSIGNMENT_SECTION+=$'\n'"- Review all relevant files and documentation"
ASSIGNMENT_SECTION+=$'\n'"- Follow established patterns and conventions"
ASSIGNMENT_SECTION+=$'\n'"- Complete all required sections in output file"

# Add expected output
ASSIGNMENT_SECTION+=$'\n'
ASSIGNMENT_SECTION+=$'\n'"### Expected Output"
ASSIGNMENT_SECTION+=$'\n'
ASSIGNMENT_SECTION+=$'\n'"Update \`$OUTPUT_FILE\` with all required sections."

# Add separator
ASSIGNMENT_SECTION+=$'\n'
ASSIGNMENT_SECTION+=$'\n'"---"

# Update NOTES.md
# 1. Remove old Current Assignment section if exists
# 2. Insert new assignment after status marker
# 3. Update Current Status section
# 4. Add Handoff Log entry

TEMP_FILE=$(mktemp)

# Check if Current Assignment section exists
if grep -q "## Current Assignment" "$NOTES_FILE"; then
    # Remove old assignment section (from ## Current Assignment to ---)
    sed '/## Current Assignment/,/^---$/d' "$NOTES_FILE" > "$TEMP_FILE"
else
    cp "$NOTES_FILE" "$TEMP_FILE"
fi

# Insert new assignment after the status marker line
sed -i "/^<!-- PROJECT:STATUS:/a\\
$ASSIGNMENT_SECTION" "$TEMP_FILE"

# Update Current Status section
sed -i "/^\*\*Phase\*\*:/c\\**Phase**: $PHASE" "$TEMP_FILE"
sed -i "/^\*\*Assigned\*\*:/c\\**Assigned**: ${AGENT^}" "$TEMP_FILE"

# Add Handoff Log entry (find the table and add row after header)
if grep -q "## Handoff Log" "$TEMP_FILE"; then
    # Find the handoff log table and add entry
    HANDOFF_ENTRY="| $TIMESTAMP_FULL | ${COORDINATOR^} | ${AGENT^} | $TASK | $OUTPUT_FILE | Assigned ($MSG_ID) |"

    # Add after the header separator line in Handoff Log table
    sed -i "/## Handoff Log/,/^$/s/|-----------|------|----|----|------|--------|/|-----------|------|----|----|------|--------|\n$HANDOFF_ENTRY/" "$TEMP_FILE"
fi

# Move temp file to original
mv "$TEMP_FILE" "$NOTES_FILE"

echo "✅ Updated $NOTES_FILE"
echo "   Agent: ${AGENT^}"
echo "   Phase: $PHASE"
echo "   Task: $TASK"
echo "   MSG_ID: $MSG_ID"
echo ""

# Send handoff message via team-aliases
NOLAN_ROOT="${NOLAN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")/..}"

if [[ -f "$NOLAN_ROOT/app/scripts/team-aliases.sh" ]]; then
    source "$NOLAN_ROOT/app/scripts/team-aliases.sh"

    # Send minimal message: just the project name
    $AGENT "$PROJECT_NAME" || {
        echo "⚠️  Warning: Failed to send message to $AGENT" >&2
        echo "   Please manually notify $AGENT about $PROJECT_NAME" >&2
    }

    echo "✅ Sent assignment to $AGENT"
else
    echo "⚠️  Warning: team-aliases.sh not found" >&2
    echo "   Please manually notify $AGENT: $PROJECT_NAME" >&2
fi
