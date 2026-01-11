#!/bin/bash
#
# SessionStart hook: Auto-load team status on session start.
#
# Exit codes:
#   0 - Success (output added to context)
#
# Output (stdout): Team status summary

# Source shared helpers (non-fatal if missing)
source "$(dirname "$0")/_lib.sh" 2>/dev/null || true

# Use PROJECTS_DIR from environment (REQUIRED - set by launch scripts)
if [[ -z "${PROJECTS_DIR:-}" ]]; then
    echo "## Nolan Team Status"
    echo ""
    echo "ERROR: PROJECTS_DIR environment variable is not set."
    echo "This must be configured in your launch environment."
    exit 0
fi
PROJECTS_BASE="$PROJECTS_DIR"

# Validate identity
if [[ -z "${AGENT_NAME:-}" ]]; then
    echo "## Nolan Team Status"
    echo ""
    echo "⚠️  WARNING: AGENT_NAME environment variable is not set."
    echo "Your identity has not been reliably established. Status updates may fail validation."
    echo "Identity should be set by the launch environment."
    echo ""
fi

# Get team context from environment (set by launch scripts)
CURRENT_TEAM="${TEAM_NAME:-}"

# If no team set, show warning and exit
if [[ -z "$CURRENT_TEAM" ]]; then
    echo "## Nolan Team Status"
    echo ""
    echo "⚠️  WARNING: TEAM_NAME environment variable is not set."
    echo "Team context not established. Cannot show team-specific status."
    echo ""
    exit 0
fi

# Load team config (NOLAN_ROOT required)
if [[ -z "${NOLAN_ROOT:-}" ]]; then
    echo "## Nolan Team Status"
    echo ""
    echo "ERROR: NOLAN_ROOT environment variable is not set."
    echo "This must be configured in your launch environment."
    exit 0
fi
# Search for team config in teams directory (supports subdirectories)
TEAM_CONFIG=$(find "$NOLAN_ROOT/teams" -name "${CURRENT_TEAM}.yaml" -type f 2>/dev/null | head -1)

if [[ -z "$TEAM_CONFIG" ]] || [[ ! -f "$TEAM_CONFIG" ]]; then
    echo "## Nolan Team Status"
    echo ""
    echo "⚠️  WARNING: Team config not found for team: $CURRENT_TEAM"
    echo ""
    exit 0
fi

# Get team info using Python (for YAML parsing)
# Only show current agent's role, not full team roster
CURRENT_AGENT="${AGENT_NAME:-}"
TEAM_INFO=$(python3 -c "
import yaml, os
from pathlib import Path

config = yaml.safe_load(Path('$TEAM_CONFIG').read_text())
team = config['team']
current_agent = os.environ.get('AGENT_NAME', '').lower()

# Get coordinator
coordinator = team['workflow']['coordinator']

# Get workflow participants with their phases
phases = team['workflow'].get('phases', [])
phase_owners = {}
for phase in phases:
    owner = phase['owner']
    if owner not in phase_owners:
        phase_owners[owner] = []
    phase_owners[owner].append(phase['name'])

# Determine current agent's role
if current_agent == coordinator:
    my_role = 'coordinator'
elif current_agent in phase_owners:
    my_role = '/'.join(phase_owners[current_agent]).lower()
elif current_agent.startswith('ralph'):
    my_role = 'support'
else:
    my_role = 'workflow'

print(f\"Team: {team['name']}\")
print(f\"Role: {current_agent.capitalize()} ({my_role})\")
" 2>/dev/null)

# Header with team context
echo "## Nolan Team Status"
echo ""
echo "$TEAM_INFO"
echo ""

# Show agent's output requirements (helps avoid validation failures)
if [[ -n "${AGENT_NAME:-}" ]]; then
    REQ_SCRIPT="$NOLAN_ROOT/app/scripts/get-requirements.sh"
    if [[ -x "$REQ_SCRIPT" ]]; then
        REQ_OUTPUT=$("$REQ_SCRIPT" "$AGENT_NAME" "$CURRENT_TEAM" 2>/dev/null) || true
        if [[ -n "$REQ_OUTPUT" ]]; then
            echo "### Output Requirements"
            echo "$REQ_OUTPUT"
            echo ""
        fi
    fi
fi

# Show assigned project path if set (critical for agents to find project docs)
if [[ -n "${DOCS_PATH:-}" ]]; then
    echo "### Assigned Project"
    echo "**Path:** \`$DOCS_PATH\`"
    echo ""
fi

# Show pending task instructions for this agent (if any)
# These are written by assign.sh when a task is assigned
# Uses symlink to current assignment (individual files preserved for audit)
# Structure: .state/{team}/instructions/{project}/{agent}/{MSG_ID}.yaml
#            .state/{team}/instructions/_current/{agent}.yaml -> symlink
# Note: Symlink may be in a different team's directory (cross-team assignments)
if [[ -n "${AGENT_NAME:-}" ]]; then
    INSTRUCTION_FILE=""
    INSTRUCTIONS_BASE=""

    # First try current team
    if [[ -L "$NOLAN_ROOT/.state/$CURRENT_TEAM/instructions/_current/${AGENT_NAME}.yaml" ]]; then
        INSTRUCTIONS_BASE="$NOLAN_ROOT/.state/$CURRENT_TEAM/instructions"
        INSTRUCTION_FILE="$INSTRUCTIONS_BASE/_current/${AGENT_NAME}.yaml"
    else
        # Search other teams for this agent's current task
        for team_dir in "$NOLAN_ROOT/.state"/*/; do
            [[ -d "$team_dir" ]] || continue
            local_team=$(basename "$team_dir")
            if [[ -L "${team_dir}instructions/_current/${AGENT_NAME}.yaml" ]]; then
                INSTRUCTIONS_BASE="${team_dir}instructions"
                INSTRUCTION_FILE="$INSTRUCTIONS_BASE/_current/${AGENT_NAME}.yaml"
                break
            fi
        done
    fi

    if [[ -n "$INSTRUCTION_FILE" ]] && [[ -f "$INSTRUCTION_FILE" ]]; then
        echo "### Pending Task Assignment"
        echo ""
        # Parse and display the instruction file
        python3 -c "
import yaml
from pathlib import Path

try:
    data = yaml.safe_load(Path('$INSTRUCTION_FILE').read_text())
    print(f\"**Project:** {data.get('project', 'unknown')}\")
    print(f\"**Phase:** {data.get('phase', 'unknown')}\")
    print(f\"**Assigned:** {data.get('assigned', 'unknown')}\")
    print(f\"**MSG_ID:** \`{data.get('msg_id', 'unknown')}\`\")
    print()
    print('**Task:**')
    task = data.get('task', '').strip()
    for line in task.split('\n'):
        print(f'> {line}')
    print()

    # Show predecessor files
    pred_files = data.get('predecessor_files', [])
    if pred_files:
        print('**Files to Review:**')
        for f in pred_files:
            if isinstance(f, dict):
                print(f\"- {f.get('file', f)} - {f.get('description', '')}\")
            else:
                print(f'- {f}')
        print()

    # Show phase instructions
    instructions = data.get('instructions', '').strip()
    if instructions:
        print('**Phase Instructions:**')
        print(f'> {instructions}')
        print()

    print(f\"**Output file:** \`{data.get('output_file', 'unknown')}\`\")
except Exception as e:
    print(f'Error reading instructions: {e}')
" 2>/dev/null || echo "_(Error parsing instruction file)_"
        echo ""
        echo "---"
        echo ""
    fi
fi

# Handoff directories
PENDING_DIR="$NOLAN_ROOT/.state/handoffs/pending"
PROCESSED_DIR="$NOLAN_ROOT/.state/handoffs/processed"

# Process handoffs for coordinator
COORDINATOR=$(python3 -c "
import yaml, os, sys
try:
    config = yaml.safe_load(open('$TEAM_CONFIG'))
    coordinator = config.get('team', {}).get('workflow', {}).get('coordinator')
    if not coordinator:
        print('ERROR: No coordinator defined in team config', file=sys.stderr)
        sys.exit(1)
    print(coordinator)
except Exception as e:
    print(f'ERROR: Failed to get coordinator: {e}', file=sys.stderr)
    sys.exit(1)
" 2>/dev/null)

if [[ -z "$COORDINATOR" ]]; then
    echo "ERROR: Could not determine coordinator from team config."
    exit 0
fi

if [[ "${AGENT_NAME:-}" == "$COORDINATOR" ]] && [[ -d "$PENDING_DIR" ]]; then
    mkdir -p "$PROCESSED_DIR"
    LOCK_FILE="$NOLAN_ROOT/.state/handoffs/.lock-pending"

    # Use flock for atomic batch ACK (prevents race with other processes)
    ack_count=0
    if command -v flock >/dev/null 2>&1; then
        # Count files before lock for comparison
        before_count=$(find "$PROCESSED_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)

        (
            flock -w 10 200 || exit 1
            shopt -s nullglob
            for f in "$PENDING_DIR"/*.handoff; do
                [[ -f "$f" ]] || continue
                mv "$f" "$PROCESSED_DIR/" 2>/dev/null || true
            done
            shopt -u nullglob
        ) 200>"$LOCK_FILE"

        # Count files after to determine how many were moved
        after_count=$(find "$PROCESSED_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)
        ack_count=$((after_count - before_count))
    else
        # Fallback without flock (less safe but functional)
        shopt -s nullglob
        for f in "$PENDING_DIR"/*.handoff; do
            [[ -f "$f" ]] || continue
            mv "$f" "$PROCESSED_DIR/" 2>/dev/null && ((ack_count++)) || true
        done
        shopt -u nullglob
    fi

    if [[ $ack_count -gt 0 ]]; then
        echo "### Processed $ack_count handoff(s)"
        echo ""
    fi
fi

# Count pending handoffs
pending_count=0
if [[ -d "$PENDING_DIR" ]]; then
    pending_count=$(find "$PENDING_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)
fi

# Only show pending handoff details to coordinator
if [[ $pending_count -gt 0 ]]; then
    # Load coordinator from current team config (no fallback - require explicit config)
    COORDINATOR_2=$(python3 -c "
import yaml, os, sys
try:
    config = yaml.safe_load(open('$TEAM_CONFIG'))
    coordinator = config.get('team', {}).get('workflow', {}).get('coordinator')
    if coordinator:
        print(coordinator)
except Exception:
    pass
" 2>/dev/null)

    # Use first COORDINATOR if available, otherwise second lookup
    if [[ -z "$COORDINATOR" ]] && [[ -n "$COORDINATOR_2" ]]; then
        COORDINATOR="$COORDINATOR_2"
    fi

    # Check if agent is Ralph (support agent with full access)
    is_ralph=false
    [[ "${AGENT_NAME:-}" == "ralph" ]] || [[ "${AGENT_NAME:-}" =~ ^ralph- ]] && is_ralph=true

    if [[ "${AGENT_NAME:-}" == "$COORDINATOR" ]] || [[ "$is_ralph" == "true" ]]; then
        # Coordinator and Ralph see full details
        echo "### ⚠️ Pending Handoffs ($pending_count)"
        echo ""
        echo "| ID | Timestamp | From | Project | Team |"
        echo "|----|-----------|------|---------|------|"

        # Parse and display handoff files
        for handoff_file in "$PENDING_DIR"/*.handoff; do
            [[ -f "$handoff_file" ]] || continue

            # Parse YAML handoff file
            handoff_data=$(python3 -c "
import yaml, sys
try:
    with open('$handoff_file') as f:
        data = yaml.safe_load(f)
    print(f\"{data.get('id', 'unknown')}|{data.get('timestamp', 'unknown')}|{data.get('from_agent', 'unknown')}|{data.get('project', 'unknown')}|{data.get('team', 'unknown')}\")
except Exception as e:
    print(f'error|{e}|||', file=sys.stderr)
" 2>/dev/null)

            if [[ -n "$handoff_data" ]]; then
                IFS='|' read -r h_id h_time h_from h_project h_team <<< "$handoff_data"
                echo "| \`${h_id:0:8}\` | $h_time | $h_from | $h_project | $h_team |"
            fi
        done
        echo ""
        echo "**Action Required:** Run \`/handoff\` to manage pending handoffs."
        echo ""
    else
        # Workflow agents see minimal info
        echo "### Handoffs Pending: $pending_count"
        echo ""
    fi
fi

# ===== PROJECT STATUS DETECTION (FILE-BASED) =====
# Status determined by file content, not markers:
# - inprogress: Has Current Assignment section with Agent
# - pending: No active assignment
# - complete: Backend determines via required headers (not checked here)
#
# Returns via global: PROJECT_STATUS = "inprogress" | "pending"
get_project_status() {
    local coord_path="$1"
    PROJECT_STATUS="pending"

    [[ ! -f "$coord_path" ]] && return

    # Check for active assignment (Current Assignment with Agent field)
    if grep -q '## Current Assignment' "$coord_path" 2>/dev/null; then
        if grep -q '\*\*Agent\*\*:' "$coord_path" 2>/dev/null; then
            PROJECT_STATUS="inprogress"
            return
        fi
    fi

    # No active assignment = pending
    PROJECT_STATUS="pending"
}

# Collect projects by status
pending_projects=""
active_count=0
pending_count=0

for dir in "$PROJECTS_BASE"/*/; do
    [[ -d "$dir" ]] || continue
    project=$(basename "$dir")
    [[ "$project" == _* ]] && continue  # Skip template directories
    [[ "$project" == .* ]] && continue  # Skip hidden directories (.legacy, .state, .handoffs)

    # Filter by team - only show projects belonging to current team
    team_file="$dir/.team"
    if [[ -f "$team_file" ]]; then
        project_team=$(cat "$team_file" 2>/dev/null)
        [[ "$project_team" != "$CURRENT_TEAM" ]] && continue
    else
        # No .team file - skip (project not assigned to any team)
        continue
    fi

    # Get coordinator file from team config (skip if no .team file)
    coordinator_file=$(get_coordinator_file "$dir" 2>/dev/null) || continue
    coord_path="$dir/$coordinator_file"

    # Get status from file content
    get_project_status "$coord_path"

    case "$PROJECT_STATUS" in
        inprogress)
            ((active_count++)) || true
            echo "### $project"

            # Show Current Assignment section (if exists)
            if grep -q "## Current Assignment" "$coord_path" 2>/dev/null; then
                assignment=$(sed -n '/## Current Assignment/,/^---$/p' "$coord_path" | sed '$d')
                if [[ -n "$assignment" ]]; then
                    echo "$assignment"
                    echo ""
                fi
            fi

            # Show status section
            status=$(grep -A3 "## Current Status" "$coord_path" 2>/dev/null | head -4)
            [[ -z "$status" ]] && status=$(grep -A3 "^## Status" "$coord_path" 2>/dev/null | head -4)
            if [[ -n "$status" ]]; then
                echo "$status"
            else
                echo "_In progress (no status section)_"
            fi
            echo ""
            ;;
        pending)
            ((pending_count++)) || true
            pending_projects="$pending_projects$project\n"
            ;;
    esac
done

# Show pending projects (no active assignment)
if [[ -n "$pending_projects" ]]; then
    pending_clean=$(echo -e "$pending_projects" | grep -v '^$' | sort)
    if [[ -n "$pending_clean" ]]; then
        echo "### Pending (no assignment)"
        echo "$pending_clean"
        echo ""
    fi
fi

# Summary line
echo "---"
if [[ $active_count -eq 0 && $pending_count -eq 0 ]]; then
    echo "No active projects."
else
    summary=""
    [[ $active_count -gt 0 ]] && summary="${active_count} active"
    [[ $pending_count -gt 0 ]] && summary="${summary}${summary:+, }${pending_count} pending"
    echo "_${summary}_"
fi

exit 0
