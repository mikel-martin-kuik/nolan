#!/bin/bash
#
# assign.sh - Update Current Assignment section in note_taker's output file
#
# Usage (preferred - agent derived from phase):
#   assign.sh <project-name> <phase> <task-description>
#   assign.sh nolan-native-terminal Research "Investigate the terminal integration"
#
# Usage (explicit agent - for edge cases):
#   assign.sh <project-name> --agent <agent> <phase> <task-description>
#   assign.sh nolan-native-terminal --agent enzo "Plan Review" "Review Carl's implementation"
#
# The agent is automatically determined from the phase owner in team config.
# This makes assignment deterministic and agent-transparent.
#
# This script:
# 1. Updates the Current Assignment section in note_taker's output file (NOTES.md)
# 2. Updates the Current Status section
# 3. Adds entry to Handoff Log
# 4. Sends minimal handoff message to agent
#

set -euo pipefail

# Parse arguments
EXPLICIT_AGENT=""
PROJECT_NAME=""
PHASE=""
TASK=""

# Check for --agent flag
if [[ $# -ge 4 ]] && [[ "$2" == "--agent" ]]; then
    # Explicit agent mode: assign.sh <project> --agent <agent> <phase> <task>
    if [[ $# -lt 5 ]]; then
        echo "Usage: assign.sh <project-name> --agent <agent> <phase> <task-description>" >&2
        exit 1
    fi
    PROJECT_NAME="$1"
    EXPLICIT_AGENT="$3"
    PHASE="$4"
    TASK="$5"
elif [[ $# -ge 3 ]]; then
    # Auto-agent mode: assign.sh <project> <phase> <task>
    PROJECT_NAME="$1"
    PHASE="$2"
    TASK="$3"
else
    echo "Usage: assign.sh <project-name> <phase> <task-description>" >&2
    echo "       assign.sh <project-name> --agent <agent> <phase> <task-description>" >&2
    echo "" >&2
    echo "Examples:" >&2
    echo "  assign.sh my-project Research 'Investigate the problem'" >&2
    echo "  assign.sh my-project Planning 'Create implementation plan'" >&2
    echo "  assign.sh my-project --agent enzo 'Plan Review' 'Review the plan'" >&2
    exit 1
fi

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

# Get phase owner from team config
# Usage: agent=$(get_phase_owner "$project_path" "$phase")
get_phase_owner() {
    local project_path="$1"
    local phase="$2"

    python3 -c "
import yaml, os, sys
from pathlib import Path

project_path = Path('$project_path')
phase_name = '$phase'

# Parse team name from .team file
team_file = project_path / '.team'
content = team_file.read_text()
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        team_name = data['team']
    else:
        team_name = content.strip()
except:
    team_name = content.strip()

nolan_root = Path(os.environ.get('NOLAN_ROOT', os.path.expanduser('~/nolan')))

# Search for team config
config_path = None
for path in (nolan_root / 'teams').rglob(f'{team_name}.yaml'):
    config_path = path
    break

if config_path is None:
    print(f'ERROR: Team config not found: {team_name}', file=sys.stderr)
    sys.exit(1)

config = yaml.safe_load(config_path.read_text())
phases = config.get('team', {}).get('workflow', {}).get('phases', [])

# Find phase owner (case-insensitive match)
for phase in phases:
    if phase.get('name', '').lower() == phase_name.lower():
        owner = phase.get('owner', '')
        if owner:
            print(owner)
            sys.exit(0)
        else:
            print(f'ERROR: Phase \"{phase_name}\" has no owner defined', file=sys.stderr)
            sys.exit(1)

# Phase not found - list available phases
available = [p.get('name', '') for p in phases]
print(f'ERROR: Phase \"{phase_name}\" not found. Available: {available}', file=sys.stderr)
sys.exit(1)
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

# Get note_taker from team config (replaces coordinator pattern)
get_note_taker() {
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
# Try note_taker first (new pattern), fall back to coordinator (legacy)
note_taker = config.get('team', {}).get('workflow', {}).get('note_taker') or config.get('team', {}).get('workflow', {}).get('coordinator')
if not note_taker:
    print(f'ERROR: No note_taker or coordinator defined in team config: {team_name}', file=sys.stderr)
    sys.exit(1)
print(note_taker)
"
}

# Get note_taker's output file from team config (replaces coordinator pattern)
get_note_taker_file() {
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
# Try note_taker first (new pattern), fall back to coordinator (legacy)
note_taker = config.get('team', {}).get('workflow', {}).get('note_taker') or config.get('team', {}).get('workflow', {}).get('coordinator')
if not note_taker:
    print(f'ERROR: No note_taker or coordinator defined in team config: {team_name}', file=sys.stderr)
    sys.exit(1)

for agent in config['team']['agents']:
    if agent['name'] == note_taker:
        print(agent.get('output_file', 'NOTES.md'))
        break
"
}

NOTE_TAKER=$(get_note_taker "$PROJECT_DIR")
NOTES_FILE=$(get_note_taker_file "$PROJECT_DIR")
NOTES_PATH="$PROJECT_DIR/$NOTES_FILE"

# Determine AGENT: use explicit if provided, otherwise derive from phase owner
if [[ -n "$EXPLICIT_AGENT" ]]; then
    AGENT="$EXPLICIT_AGENT"
    echo "Using explicit agent: $AGENT"
else
    AGENT=$(get_phase_owner "$PROJECT_DIR" "$PHASE")
    if [[ -z "$AGENT" ]]; then
        echo "Error: Could not determine agent for phase: $PHASE" >&2
        exit 1
    fi
    echo "Phase '$PHASE' -> Agent: $AGENT"
fi

# Validate notes file exists
if [[ ! -f "$NOTES_PATH" ]]; then
    echo "Error: Notes file not found: $NOTES_PATH" >&2
    exit 1
fi

# Generate timestamp and MSG_ID
# Format: MSG_<NOTE_TAKER>_<8-hex-chars>
TIMESTAMP=$(date +"%Y-%m-%d")
TIMESTAMP_FULL=$(date +"%Y-%m-%d %H:%M")
MSG_ID="MSG_${NOTE_TAKER^^}_$(openssl rand -hex 4)"

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
    # Silent exit - predecessor files are optional
    sys.exit(0)

config = yaml.safe_load(config_path.read_text())

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

# Update note_taker's output file using Python (safer for special characters)
# 1. Remove old Current Assignment section if exists
# 2. Insert new assignment after title
# 3. Update Current Status section
# 4. Add Handoff Log entry

python3 - "$NOTES_PATH" "$PHASE" "$AGENT" "$TASK" "$OUTPUT_FILE" "$MSG_ID" "$TIMESTAMP_FULL" "$NOTE_TAKER" "$PROJECT_NAME" <<'PYTHON_SCRIPT'
import sys
import re
from pathlib import Path

notes_path = Path(sys.argv[1])
phase = sys.argv[2]
agent = sys.argv[3]
task = sys.argv[4]
output_file = sys.argv[5]
msg_id = sys.argv[6]
timestamp_full = sys.argv[7]
note_taker = sys.argv[8]
project_name = sys.argv[9]

content = notes_path.read_text()

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

# Insert after title
content = re.sub(r'(^# [^\n]+\n)', r'\1\n' + assignment_section, content)

# 3. Update Current Status section
content = re.sub(r'\*\*Phase\*\*: [^\n]+', f'**Phase**: {phase}', content)
content = re.sub(r'\*\*Assigned\*\*: [^\n]+', f'**Assigned**: {agent.capitalize()}', content)

# 4. Add Handoff Log entry (with MSG_ID for audit linking)
handoff_entry = f'| {timestamp_full} | {note_taker.capitalize()} | {agent.capitalize()} | {task[:50]}{"..." if len(task) > 50 else ""} | {output_file} | `{msg_id}` |'

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

notes_path.write_text(content)
PYTHON_SCRIPT

echo "✅ Updated $NOTES_PATH"
echo "   Agent: ${AGENT^}"
echo "   Phase: $PHASE"
echo "   Task: $TASK"
echo "   MSG_ID: $MSG_ID"
echo ""

# Set agent's active project state file
# This is CRITICAL - the stop hook uses this to know which project to validate
TEAM_NAME=$(get_team_name "$PROJECT_DIR")
STATE_DIR="$NOLAN_ROOT/.state/$TEAM_NAME"
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
note_taker: $NOTE_TAKER
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
