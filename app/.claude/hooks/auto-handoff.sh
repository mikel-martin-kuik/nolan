#!/bin/bash
#
# Stop hook: Automatically complete task and create handoff when agent finishes
#
# This hook runs when an agent session ends. If the agent has an active task
# and their output file has been updated, it automatically:
# 1. Marks the task as complete
# 2. Creates a handoff file for the coordinator
#
# Exit codes:
#   0 - Success (or no action needed)
#

set -euo pipefail

# Skip if not a workflow agent (coordinators and ralph don't auto-handoff)
AGENT="${AGENT_NAME:-}"
if [[ -z "$AGENT" ]]; then
    exit 0
fi

# Skip coordinators (they use /handoff command)
if [[ "$AGENT" == "dan" ]] || [[ "$AGENT" =~ _coordinator$ ]]; then
    exit 0
fi

# Skip ralph agents
if [[ "$AGENT" == "ralph" ]] || [[ "$AGENT" =~ ^ralph- ]]; then
    exit 0
fi

# Required environment
PROJECTS_DIR="${PROJECTS_DIR:-}"
TEAM_NAME="${TEAM_NAME:-}"
NOLAN_ROOT="${NOLAN_ROOT:-}"

if [[ -z "$PROJECTS_DIR" ]] || [[ -z "$TEAM_NAME" ]] || [[ -z "$NOLAN_ROOT" ]]; then
    exit 0
fi

# Find agent's current task symlink (searches across all teams)
find_current_symlink() {
    local state_base="$PROJECTS_DIR/.state"

    # First try current team
    local current_link="$state_base/$TEAM_NAME/instructions/_current/${AGENT}.yaml"
    if [[ -L "$current_link" ]]; then
        echo "$current_link"
        return 0
    fi

    # Search other teams
    for team_dir in "$state_base"/*/; do
        [[ -d "$team_dir" ]] || continue
        local team=$(basename "$team_dir")
        [[ "$team" == "$TEAM_NAME" ]] && continue

        local link="${team_dir}instructions/_current/${AGENT}.yaml"
        if [[ -L "$link" ]]; then
            echo "$link"
            return 0
        fi
    done

    return 1
}

# Check if agent has an active task
CURRENT_LINK=$(find_current_symlink) || exit 0

if [[ -z "$CURRENT_LINK" ]] || [[ ! -L "$CURRENT_LINK" ]]; then
    # No active task - nothing to do
    exit 0
fi

# Get task file path
TASK_FILE=$(readlink -f "$CURRENT_LINK" 2>/dev/null) || exit 0

if [[ ! -f "$TASK_FILE" ]]; then
    # Task file missing - clean up stale link
    rm -f "$CURRENT_LINK"
    exit 0
fi

# Parse task info
PROJECT=$(python3 -c "import yaml; print(yaml.safe_load(open('$TASK_FILE')).get('project', ''))" 2>/dev/null) || exit 0
MSG_ID=$(python3 -c "import yaml; print(yaml.safe_load(open('$TASK_FILE')).get('msg_id', ''))" 2>/dev/null) || exit 0
PHASE=$(python3 -c "import yaml; print(yaml.safe_load(open('$TASK_FILE')).get('phase', ''))" 2>/dev/null) || exit 0
OUTPUT_FILE_NAME=$(python3 -c "import yaml; print(yaml.safe_load(open('$TASK_FILE')).get('output_file', ''))" 2>/dev/null) || exit 0

if [[ -z "$PROJECT" ]] || [[ -z "$MSG_ID" ]]; then
    exit 0
fi

# Check if agent's output file exists and has content
PROJECT_PATH="$PROJECTS_DIR/$PROJECT"
OUTPUT_FILE="$PROJECT_PATH/$OUTPUT_FILE_NAME"

if [[ ! -f "$OUTPUT_FILE" ]]; then
    # Output file not created yet - agent may not have finished
    exit 0
fi

# Check if output file has the STATUS:COMPLETE marker (indicates agent finished)
if ! grep -q "STATUS:COMPLETE" "$OUTPUT_FILE" 2>/dev/null; then
    # No completion marker - agent may not have finished
    # But still proceed if file has substantial content (>10 lines)
    LINES=$(wc -l < "$OUTPUT_FILE" 2>/dev/null || echo 0)
    if [[ "$LINES" -lt 10 ]]; then
        exit 0
    fi
fi

# Auto-complete the task
COMPLETED_AT=$(date +"%Y-%m-%d %H:%M")

# 1. Update task file status
python3 -c "
from pathlib import Path

task_file = Path('$TASK_FILE')
content = task_file.read_text()

if 'status:' not in content:
    with open(task_file, 'a') as f:
        f.write(f'\n# Auto-completion\nstatus: completed\ncompleted_at: \"$COMPLETED_AT\"\nauto_handoff: true\n')
" 2>/dev/null || true

# 2. Update Task Log in coordinator file
if [[ -d "$PROJECT_PATH" ]]; then
    source "$NOLAN_ROOT/app/.claude/hooks/_lib.sh" 2>/dev/null || true
    COORD_FILE=$(get_coordinator_file "$PROJECT_PATH" 2>/dev/null) || true
    COORD_PATH="$PROJECT_PATH/$COORD_FILE"

    if [[ -f "$COORD_PATH" ]]; then
        python3 -c "
import re
from pathlib import Path

coord_path = Path('$COORD_PATH')
content = coord_path.read_text()

# Update Task Log entry status
pattern = r'(\| \`$MSG_ID\` \|[^|]+\|[^|]+\|[^|]+\|) Active (\|)'
replacement = r'\1 Complete \2'
content = re.sub(pattern, replacement, content)

coord_path.write_text(content)
" 2>/dev/null || true
    fi

    # 3. Create handoff file
    HANDOFF_DIR="$PROJECTS_DIR/.handoffs/pending"
    mkdir -p "$HANDOFF_DIR"
    HANDOFF_ID="${MSG_ID/MSG_/HO_}"
    HANDOFF_FILE="$HANDOFF_DIR/${HANDOFF_ID}.handoff"

    cat > "$HANDOFF_FILE" <<HANDOFF_EOF
# Auto-handoff from $AGENT
id: $HANDOFF_ID
task_id: $MSG_ID
from_agent: $AGENT
project: $PROJECT
phase: $PHASE
timestamp: '$COMPLETED_AT'
team: $TEAM_NAME
instruction_file: $TASK_FILE
output_file: $OUTPUT_FILE
status: pending_review
auto_generated: true
HANDOFF_EOF
fi

# 4. Remove current symlink
rm -f "$CURRENT_LINK"

# 5. Clear active project state
rm -f "$PROJECTS_DIR/.state/$TEAM_NAME/active-${AGENT}.txt"

# Log the auto-handoff (visible in hook output)
echo "Auto-handoff: $AGENT completed task $MSG_ID for project $PROJECT"

exit 0
