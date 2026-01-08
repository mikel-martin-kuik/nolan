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
COORDINATOR_PATH="$PROJECT_DIR/$COORDINATOR_FILE"

# Validate coordinator file exists
if [[ ! -f "$COORDINATOR_PATH" ]]; then
    echo "Error: Coordinator file not found: $COORDINATOR_PATH" >&2
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

# Update coordinator's output file using Python (safer for special characters)
# 1. Remove old Current Assignment section if exists
# 2. Insert new assignment after status marker
# 3. Update Current Status section
# 4. Add Handoff Log entry

python3 - "$COORDINATOR_PATH" "$PHASE" "$AGENT" "$TASK" "$OUTPUT_FILE" "$MSG_ID" "$TIMESTAMP_FULL" "$COORDINATOR" <<'PYTHON_SCRIPT'
import sys
import re
from pathlib import Path

coord_path = Path(sys.argv[1])
phase = sys.argv[2]
agent = sys.argv[3]
task = sys.argv[4]
output_file = sys.argv[5]
msg_id = sys.argv[6]
timestamp_full = sys.argv[7]
coordinator = sys.argv[8]
timestamp_date = timestamp_full.split()[0]

content = coord_path.read_text()

# 1. Remove old Current Assignment section if exists
content = re.sub(r'## Current Assignment.*?^---\n', '', content, flags=re.MULTILINE | re.DOTALL)

# 2. Build new assignment section
assignment_section = f'''## Current Assignment

**Agent**: {agent.capitalize()}
**Task**: {task}
**Phase**: {phase}
**Assigned**: {timestamp_date} ({msg_id})

### Instructions

Complete assigned work following project requirements.

### Files to Review

- context.md - Project overview and objectives
- research.md - Research findings (if applicable)

### Focus Areas

- Review all relevant files and documentation
- Follow established patterns and conventions
- Complete all required sections in output file

### Expected Output

Update `{output_file}` with all required sections.

---
'''

# Insert after status marker
status_pattern = r'(<!-- PROJECT:STATUS:[^\n]+\n)'
if re.search(status_pattern, content):
    content = re.sub(status_pattern, r'\1\n' + assignment_section, content)
else:
    # No status marker, insert at beginning after title
    content = re.sub(r'(^# [^\n]+\n)', r'\1\n' + assignment_section, content)

# 3. Update Current Status section
content = re.sub(r'\*\*Phase\*\*: [^\n]+', f'**Phase**: {phase}', content)
content = re.sub(r'\*\*Assigned\*\*: [^\n]+', f'**Assigned**: {agent.capitalize()}', content)

# 4. Add Handoff Log entry
handoff_entry = f'| {timestamp_full} | {coordinator.capitalize()} | {agent.capitalize()} | {task} | {output_file} | Assigned ({msg_id}) |'

# Find the header separator and add entry after it
def add_handoff_entry(match):
    return match.group(0) + '\n' + handoff_entry

content = re.sub(
    r'\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|',
    add_handoff_entry,
    content,
    count=1
)

coord_path.write_text(content)
PYTHON_SCRIPT

echo "✅ Updated $COORDINATOR_PATH"
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
