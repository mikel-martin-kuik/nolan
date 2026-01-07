#!/bin/bash
#
# assign.sh - Update Current Assignment section in NOTES.md
#
# Usage:
#   assign.sh <project-name> <agent> <phase> <task-description>
#   assign.sh nolan-native-terminal enzo QA "Review Carl's implementation"
#
# This script:
# 1. Updates the Current Assignment section in project's NOTES.md
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
NOTES_FILE="$PROJECT_DIR/NOTES.md"

# Validate project exists
if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "Error: Project directory not found: $PROJECT_DIR" >&2
    exit 1
fi

if [[ ! -f "$NOTES_FILE" ]]; then
    echo "Error: NOTES.md not found: $NOTES_FILE" >&2
    exit 1
fi

# Generate timestamp and MSG_ID
# Format: MSG_DAN_<8-hex-chars> - Dan is always the sender for assignments
TIMESTAMP=$(date +"%Y-%m-%d")
TIMESTAMP_FULL=$(date +"%Y-%m-%d %H:%M")
MSG_ID="MSG_DAN_$(openssl rand -hex 4)"

# Get agent's output file from team config
get_output_file() {
    local agent="$1"
    local project_path="$2"

    python3 -c "
import yaml, os, sys
from pathlib import Path

try:
    project_path = Path('$project_path')
    team_file = project_path / '.team'
    team_name = team_file.read_text().strip() if team_file.exists() else 'default'

    nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))
    config_path = nolan_root / 'teams' / f'{team_name}.yaml'

    config = yaml.safe_load(config_path.read_text())

    for agent_config in config['team']['agents']:
        if agent_config['name'] == '$agent':
            print(agent_config.get('output_file', 'NOTES.md'))
            sys.exit(0)

    # Agent not found, default to NOTES.md
    print('NOTES.md')
except Exception as e:
    print('output.md', file=sys.stderr)  # Fallback
" 2>/dev/null || echo "output.md"
}

OUTPUT_FILE=$(get_output_file "$AGENT" "$PROJECT_DIR")

# Get phase instructions from team config
get_phase_instructions() {
    local phase="$1"
    local project_path="$2"

    python3 -c "
import yaml, os, sys
from pathlib import Path

try:
    project_path = Path('$project_path')
    team_file = project_path / '.team'
    team_name = team_file.read_text().strip() if team_file.exists() else 'default'

    nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))
    config_path = nolan_root / 'teams' / f'{team_name}.yaml'

    config = yaml.safe_load(config_path.read_text())

    for phase_config in config['team']['workflow']['phases']:
        if phase_config['name'] == '$phase':
            print(phase_config.get('template', 'Complete assigned work.'))
            sys.exit(0)

    # Phase not found, use generic instruction
    print('Complete assigned work.')
except Exception as e:
    print('Complete assigned work.', file=sys.stderr)  # Fallback
" 2>/dev/null || echo "Complete assigned work."
}

INSTRUCTIONS=$(get_phase_instructions "$PHASE" "$PROJECT_DIR")

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

# Add predecessor files based on phase
case "$PHASE" in
    Plan)
        ASSIGNMENT_SECTION+=$'\n'"- research.md - Ana's findings"
        ;;
    QA)
        if [[ "$AGENT" == "enzo" ]]; then
            # Check if we're reviewing plan or implementation
            if grep -q "progress.md ✅" "$NOTES_FILE" 2>/dev/null; then
                ASSIGNMENT_SECTION+=$'\n'"- progress.md - Carl's implementation"
                ASSIGNMENT_SECTION+=$'\n'"- plan.md - Bill's original plan"
            else
                ASSIGNMENT_SECTION+=$'\n'"- plan.md - Bill's plan"
            fi
        fi
        ;;
    Implement)
        ASSIGNMENT_SECTION+=$'\n'"- plan.md - Bill's implementation plan"
        ASSIGNMENT_SECTION+=$'\n'"- plan-review.md - Enzo's plan review"
        ;;
esac

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
    HANDOFF_ENTRY="| $TIMESTAMP_FULL | Dan | ${AGENT^} | $TASK | $OUTPUT_FILE | Assigned ($MSG_ID) |"

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
