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

# Parse team name from .team file (supports YAML and plain text formats)
# YAML format: team: default\nworkflow_files: [...]
# Plain text format: default
get_team_name() {
    local project_path="$1"

    python3 -c "
import yaml
from pathlib import Path

project_path = Path('$project_path')
team_file = project_path / '.team'
content = team_file.read_text()

# Try YAML parse first (new format)
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        print(data['team'])
    else:
        # Plain text format (legacy)
        print(content.strip())
except:
    # Fallback to plain text
    print(content.strip())
"
}

# Load team config (searches subdirectories)
# Usage: config_path=$(get_team_config_path "$team_name")
get_team_config_path() {
    local team_name="$1"
    local nolan_root="${NOLAN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

    python3 -c "
import sys
from pathlib import Path

team_name = '$team_name'
nolan_root = Path('$nolan_root')
teams_dir = nolan_root / 'teams'

# Search for team config in teams directory (supports subdirectories)
config_path = None
for path in teams_dir.rglob(f'{team_name}.yaml'):
    config_path = path
    break

if config_path is None:
    print(f'ERROR: Team config not found: {team_name}', file=sys.stderr)
    sys.exit(1)

print(config_path)
"
}

# Get coordinator from team config
get_coordinator() {
    local project_path="$1"

    python3 -c "
import yaml, os, sys
from pathlib import Path

project_path = Path('$project_path')
team_file = project_path / '.team'
content = team_file.read_text()

# Parse team name (supports YAML and plain text)
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        team_name = data['team']
    else:
        team_name = content.strip()
except:
    team_name = content.strip()

nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))

# Search for team config in teams directory (supports subdirectories)
config_path = None
for path in (nolan_root / 'teams').rglob(f'{team_name}.yaml'):
    config_path = path
    break

if config_path is None:
    print(f'ERROR: Team config not found: {team_name}', file=sys.stderr)
    sys.exit(1)

config = yaml.safe_load(config_path.read_text())
coordinator = config.get('team', {}).get('workflow', {}).get('coordinator')
if not coordinator:
    print(f'ERROR: No coordinator defined in team config: {team_name}', file=sys.stderr)
    sys.exit(1)
print(coordinator)
"
}

# Get coordinator's output file from team config
get_coordinator_file() {
    local project_path="$1"

    python3 -c "
import yaml, os, sys
from pathlib import Path

project_path = Path('$project_path')
team_file = project_path / '.team'
content = team_file.read_text()

# Parse team name (supports YAML and plain text)
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        team_name = data['team']
    else:
        team_name = content.strip()
except:
    team_name = content.strip()

nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))

# Search for team config in teams directory (supports subdirectories)
config_path = None
for path in (nolan_root / 'teams').rglob(f'{team_name}.yaml'):
    config_path = path
    break

if config_path is None:
    print(f'ERROR: Team config not found: {team_name}', file=sys.stderr)
    sys.exit(1)

config = yaml.safe_load(config_path.read_text())
coordinator = config.get('team', {}).get('workflow', {}).get('coordinator')
if not coordinator:
    print(f'ERROR: No coordinator defined in team config: {team_name}', file=sys.stderr)
    sys.exit(1)

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
import yaml, os, sys
from pathlib import Path

project_path = Path('$project_path')
team_file = project_path / '.team'
content = team_file.read_text()

# Parse team name (supports YAML and plain text)
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        team_name = data['team']
    else:
        team_name = content.strip()
except:
    team_name = content.strip()

nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))

# Search for team config in teams directory (supports subdirectories)
config_path = None
for path in (nolan_root / 'teams').rglob(f'{team_name}.yaml'):
    config_path = path
    break

if config_path is None:
    print(f'ERROR: Team config not found: {team_name}', file=sys.stderr)
    sys.exit(1)

config = yaml.safe_load(config_path.read_text())

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
team_file = project_path / '.team'
content = team_file.read_text()

# Parse team name (supports YAML and plain text)
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        team_name = data['team']
    else:
        team_name = content.strip()
except:
    team_name = content.strip()

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
team_file = project_path / '.team'
content = team_file.read_text()

# Parse team name (supports YAML and plain text)
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        team_name = data['team']
    else:
        team_name = content.strip()
except:
    team_name = content.strip()

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

python3 - "$COORDINATOR_PATH" "$PHASE" "$AGENT" "$TASK" "$OUTPUT_FILE" "$MSG_ID" "$TIMESTAMP_FULL" "$COORDINATOR" "$PROJECT_NAME" <<'PYTHON_SCRIPT'
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
project_name = sys.argv[9]
timestamp_date = timestamp_full.split()[0]

content = coord_path.read_text()

# 1. Remove old Current Assignment section if exists
content = re.sub(r'## Current Assignment.*?^---\n', '', content, flags=re.MULTILINE | re.DOTALL)

# 2. Build new assignment section (includes MSG_ID for traceability)
assignment_section = f'''## Current Assignment

**Agent**: {agent.capitalize()}
**Task**: {task}
**Phase**: {phase}
**Assigned**: {timestamp_full}
**Task ID**: `{msg_id}`

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

# 4. Add Handoff Log entry (with MSG_ID for audit linking)
handoff_entry = f'| {timestamp_full} | {coordinator.capitalize()} | {agent.capitalize()} | {task[:50]}{"..." if len(task) > 50 else ""} | {output_file} | `{msg_id}` |'

# Find the header separator and add entry after it
def add_handoff_entry(match):
    return match.group(0) + '\n' + handoff_entry

content = re.sub(
    r'\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|',
    add_handoff_entry,
    content,
    count=1
)

# 5. Add/update Task Log section (full audit trail with file references)
task_log_header = '''## Task Log

| Task ID | Agent | Phase | Assigned | Status | Instruction File |
|---------|-------|-------|----------|--------|------------------|'''

task_entry = f'| `{msg_id}` | {agent.capitalize()} | {phase} | {timestamp_full} | Active | `instructions/{project_name}/{agent}/{msg_id}.yaml` |'

if '## Task Log' not in content:
    # Add Task Log section before Notes or at end
    if '## Notes' in content:
        content = content.replace('## Notes', task_log_header + '\n' + task_entry + '\n\n## Notes')
    elif '## Blockers' in content:
        content = content.replace('## Blockers', task_log_header + '\n' + task_entry + '\n\n## Blockers')
    else:
        content = content.rstrip() + '\n\n' + task_log_header + '\n' + task_entry + '\n'
else:
    # Add entry after Task Log header separator
    def add_task_entry(match):
        return match.group(0) + '\n' + task_entry

    content = re.sub(
        r'(\| Task ID \|.*?\n\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|[-]+\|)',
        add_task_entry,
        content,
        count=1,
        flags=re.DOTALL
    )

coord_path.write_text(content)
PYTHON_SCRIPT

echo "✅ Updated $COORDINATOR_PATH"
echo "   Agent: ${AGENT^}"
echo "   Phase: $PHASE"
echo "   Task: $TASK"
echo "   MSG_ID: $MSG_ID"
echo ""

# Set agent's active project state file
# This is CRITICAL - the stop hook uses this to know which project to validate
TEAM_NAME=$(get_team_name "$PROJECT_DIR")
STATE_DIR="$PROJECTS_DIR/.state/$TEAM_NAME"
mkdir -p "$STATE_DIR"
echo "$PROJECT_NAME" > "$STATE_DIR/active-$AGENT.txt"
echo "✅ Set active project for $AGENT"

# Write task-specific instructions to agent-scoped file (auditable, never overwritten)
# Each assignment gets a unique file based on MSG_ID for full audit trail
# Structure: .state/{team}/instructions/{project}/{agent}/{MSG_ID}.yaml
INSTRUCTIONS_DIR="$STATE_DIR/instructions/$PROJECT_NAME/$AGENT"
mkdir -p "$INSTRUCTIONS_DIR"
INSTRUCTION_FILE="$INSTRUCTIONS_DIR/${MSG_ID}.yaml"

# Also maintain a "current" symlink per agent (at agent level, not project level)
# This allows quick lookup of agent's current task regardless of project
AGENT_CURRENT_DIR="$STATE_DIR/instructions/_current"
mkdir -p "$AGENT_CURRENT_DIR"
CURRENT_LINK="$AGENT_CURRENT_DIR/${AGENT}.yaml"

cat > "$INSTRUCTION_FILE" <<INSTRUCTIONS_EOF
# Task Assignment for ${AGENT^}
# Generated: $TIMESTAMP_FULL
# ID: $MSG_ID

project: $PROJECT_NAME
project_path: $PROJECT_DIR
agent: $AGENT
phase: $PHASE
task: |
  $TASK
assigned: "$TIMESTAMP_FULL"
msg_id: $MSG_ID
coordinator: $COORDINATOR
output_file: $OUTPUT_FILE

# Files to Review
predecessor_files:
  - context.md
$(echo "$PREDECESSOR_FILES" | sed 's/^- /  - /g' | grep -v '^$' || true)

# Phase Instructions
instructions: |
  $INSTRUCTIONS
INSTRUCTIONS_EOF

# Update current symlink (atomic via temp + mv)
# Use relative path from _current/ to project/agent/file
RELATIVE_PATH="../$PROJECT_NAME/$AGENT/$(basename "$INSTRUCTION_FILE")"
ln -sf "$RELATIVE_PATH" "${CURRENT_LINK}.tmp"
mv -f "${CURRENT_LINK}.tmp" "$CURRENT_LINK"

echo "✅ Wrote instructions to $INSTRUCTION_FILE"
echo "   Audit trail: $STATE_DIR/instructions/$PROJECT_NAME/"

# Send handoff message via team-aliases
NOLAN_ROOT="${NOLAN_ROOT:-$(dirname "$(dirname "$(readlink -f "$0")")")/..}"

if [[ -f "$NOLAN_ROOT/app/scripts/team-aliases.sh" ]]; then
    source "$NOLAN_ROOT/app/scripts/team-aliases.sh"

    # Build handoff message with project, phase, and task summary
    # The full instructions are in the instruction file
    HANDOFF_MSG="HANDOFF: $PROJECT_NAME | Phase: $PHASE | Task: $TASK | Instructions: $INSTRUCTION_FILE"

    $AGENT "$HANDOFF_MSG" || {
        echo "⚠️  Warning: Failed to send message to $AGENT" >&2
        echo "   Please manually notify $AGENT about $PROJECT_NAME" >&2
    }

    echo "✅ Sent assignment to $AGENT"
else
    echo "⚠️  Warning: team-aliases.sh not found" >&2
    echo "   Please manually notify $AGENT: $PROJECT_NAME" >&2
fi
