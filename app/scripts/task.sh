#!/bin/bash
#
# task.sh - Task management for Nolan agents
#
# Usage:
#   task assign <project> <agent> <phase> <task>   - Assign task (wrapper for assign.sh)
#   task complete [agent]                          - Mark current task complete
#   task list [--agent <name>] [--project <name>]  - List tasks
#   task show <msg_id>                             - Show task details
#   task history <project>                         - Show task history for project
#   task current [agent]                           - Show agent's current task
#   task cleanup [--days <n>] [--dry-run]          - Clean old completed tasks
#
# Environment:
#   PROJECTS_DIR  - Projects directory (required)
#   NOLAN_ROOT    - Nolan root directory (required)
#   AGENT_NAME    - Current agent name (for 'complete' without args)
#   TEAM_NAME     - Current team name (required)
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Validate required environment
check_env() {
    if [[ -z "${PROJECTS_DIR:-}" ]]; then
        echo -e "${RED}ERROR: PROJECTS_DIR environment variable not set${NC}" >&2
        exit 1
    fi
    if [[ -z "${NOLAN_ROOT:-}" ]]; then
        echo -e "${RED}ERROR: NOLAN_ROOT environment variable not set${NC}" >&2
        exit 1
    fi
    if [[ -z "${TEAM_NAME:-}" ]]; then
        echo -e "${RED}ERROR: TEAM_NAME environment variable not set${NC}" >&2
        exit 1
    fi
}

# Get instructions base directory for a specific team
get_instructions_base() {
    local team="${1:-$TEAM_NAME}"
    echo "$PROJECTS_DIR/.state/$team/instructions"
}

# Find agent's current task symlink across all teams
# Returns: path to symlink if found, empty if not
find_agent_current_symlink() {
    local agent="$1"
    local state_base="$PROJECTS_DIR/.state"

    # First try current team
    local current_link="$state_base/$TEAM_NAME/instructions/_current/${agent}.yaml"
    if [[ -L "$current_link" ]]; then
        echo "$current_link"
        return 0
    fi

    # Search other teams
    for team_dir in "$state_base"/*/; do
        [[ -d "$team_dir" ]] || continue
        local team=$(basename "$team_dir")
        [[ "$team" == "$TEAM_NAME" ]] && continue  # Already checked

        local link="$team_dir/instructions/_current/${agent}.yaml"
        if [[ -L "$link" ]]; then
            echo "$link"
            return 0
        fi
    done

    return 1
}

# ===== ASSIGN =====
# Wrapper for assign.sh
cmd_assign() {
    if [[ $# -lt 4 ]]; then
        echo "Usage: task assign <project> <agent> <phase> <task>" >&2
        exit 1
    fi

    local script_dir="$(dirname "$(readlink -f "$0")")"
    exec "$script_dir/assign.sh" "$@"
}

# ===== COMPLETE =====
# Mark current task as complete
cmd_complete() {
    check_env

    local agent="${1:-${AGENT_NAME:-}}"

    if [[ -z "$agent" ]]; then
        echo -e "${RED}ERROR: Agent name required (provide as arg or set AGENT_NAME)${NC}" >&2
        exit 1
    fi

    # Find current symlink (searches across all teams)
    local current_link=$(find_agent_current_symlink "$agent")

    if [[ -z "$current_link" ]] || [[ ! -L "$current_link" ]]; then
        echo -e "${YELLOW}No active task for $agent${NC}"
        exit 0
    fi

    # Read task details before completing
    local task_file=$(readlink -f "$current_link")

    if [[ ! -f "$task_file" ]]; then
        echo -e "${RED}ERROR: Task file not found: $task_file${NC}" >&2
        rm -f "$current_link"
        exit 1
    fi

    # Parse task info
    local project=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('project', 'unknown'))" 2>/dev/null)
    local msg_id=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('msg_id', 'unknown'))" 2>/dev/null)
    local phase=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('phase', 'unknown'))" 2>/dev/null)

    # Add completion timestamp to the task file
    local completed_at=$(date +"%Y-%m-%d %H:%M")
    python3 -c "
import yaml
from pathlib import Path

task_file = Path('$task_file')
data = yaml.safe_load(task_file.read_text())
data['status'] = 'completed'
data['completed_at'] = '$completed_at'

# Preserve comments by reading and appending
content = task_file.read_text()
if 'status:' not in content:
    with open(task_file, 'a') as f:
        f.write(f'\n# Completion\nstatus: completed\ncompleted_at: \"$completed_at\"\n')
else:
    task_file.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))
"

    # Update Task Log in coordinator file
    local project_path="$PROJECTS_DIR/$project"
    if [[ -d "$project_path" ]]; then
        # Source helper to get coordinator file
        source "$(dirname "$0")/../.claude/hooks/_lib.sh" 2>/dev/null || true
        local coord_file=$(get_coordinator_file "$project_path" 2>/dev/null) || true
        local coord_path="$project_path/$coord_file"

        if [[ -f "$coord_path" ]]; then
            python3 -c "
import re
from pathlib import Path

coord_path = Path('$coord_path')
content = coord_path.read_text()

# Update Task Log entry status from Active to Complete
pattern = r'(\| \`$msg_id\` \|[^|]+\|[^|]+\|[^|]+\|) Active (\|)'
replacement = r'\1 Complete \2'
content = re.sub(pattern, replacement, content)

coord_path.write_text(content)
" 2>/dev/null || true
        fi

        # Create handoff file for coordinator to ACK
        local handoff_dir="$PROJECTS_DIR/.handoffs/pending"
        mkdir -p "$handoff_dir"
        local handoff_id="${msg_id/MSG_/HO_}"
        local handoff_file="$handoff_dir/${handoff_id}.handoff"

        cat > "$handoff_file" <<HANDOFF_EOF
# Handoff from $agent
id: $handoff_id
task_id: $msg_id
from_agent: $agent
project: $project
phase: $phase
timestamp: '$completed_at'
team: $TEAM_NAME
instruction_file: $(dirname "$task_file")/$(basename "$task_file")
status: pending_review
HANDOFF_EOF
        echo "  Created handoff: $handoff_id"
    fi

    # Remove current symlink
    rm -f "$current_link"

    # Clear active project state
    local state_file="$PROJECTS_DIR/.state/$TEAM_NAME/active-${agent}.txt"
    rm -f "$state_file"

    echo -e "${GREEN}✓ Task completed${NC}"
    echo "  Agent: $agent"
    echo "  Project: $project"
    echo "  Phase: $phase"
    echo "  MSG_ID: $msg_id"
    echo "  Completed: $completed_at"
    echo "  Task file: $task_file"
}

# ===== LIST =====
# List tasks with optional filters
cmd_list() {
    check_env

    local filter_agent=""
    local filter_project=""
    local show_completed=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --agent|-a)
                filter_agent="$2"
                shift 2
                ;;
            --project|-p)
                filter_project="$2"
                shift 2
                ;;
            --all)
                show_completed=true
                shift
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit 1
                ;;
        esac
    done

    local base=$(get_instructions_base)

    if [[ ! -d "$base" ]]; then
        echo "No tasks found."
        exit 0
    fi

    echo -e "${BLUE}Tasks for team: $TEAM_NAME${NC}"
    echo ""

    # Show current assignments first
    echo -e "${GREEN}=== Active Tasks ===${NC}"
    local current_dir="$base/_current"
    local active_count=0

    if [[ -d "$current_dir" ]]; then
        for link in "$current_dir"/*.yaml; do
            [[ -L "$link" ]] || continue

            local agent=$(basename "$link" .yaml)
            [[ -n "$filter_agent" && "$agent" != "$filter_agent" ]] && continue

            local task_file=$(readlink -f "$link" 2>/dev/null) || continue
            [[ -f "$task_file" ]] || continue

            local project=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('project', '?'))" 2>/dev/null)
            [[ -n "$filter_project" && "$project" != "$filter_project" ]] && continue

            local phase=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('phase', '?'))" 2>/dev/null)
            local task=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('task', '?').strip()[:50])" 2>/dev/null)
            local msg_id=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('msg_id', '?'))" 2>/dev/null)
            local assigned=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('assigned', '?'))" 2>/dev/null)

            printf "  %-10s %-25s %-12s %s\n" "$agent" "$project" "$phase" "$msg_id"
            printf "             Task: %s\n" "$task"
            printf "             Assigned: %s\n" "$assigned"
            echo ""
            ((active_count++))
        done
    fi

    if [[ $active_count -eq 0 ]]; then
        echo "  (none)"
        echo ""
    fi

    # Show completed tasks if requested
    if [[ "$show_completed" == "true" ]]; then
        echo -e "${CYAN}=== Completed Tasks ===${NC}"

        local completed_count=0
        for project_dir in "$base"/*/; do
            [[ -d "$project_dir" ]] || continue
            local project=$(basename "$project_dir")
            [[ "$project" == "_current" ]] && continue
            [[ -n "$filter_project" && "$project" != "$filter_project" ]] && continue

            for agent_dir in "$project_dir"/*/; do
                [[ -d "$agent_dir" ]] || continue
                local agent=$(basename "$agent_dir")
                [[ -n "$filter_agent" && "$agent" != "$filter_agent" ]] && continue

                for task_file in "$agent_dir"/*.yaml; do
                    [[ -f "$task_file" ]] || continue

                    local status=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('status', 'active'))" 2>/dev/null)
                    [[ "$status" != "completed" ]] && continue

                    local msg_id=$(basename "$task_file" .yaml)
                    local completed_at=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('completed_at', '?'))" 2>/dev/null)

                    printf "  %-10s %-25s %s (completed: %s)\n" "$agent" "$project" "$msg_id" "$completed_at"
                    ((completed_count++))
                done
            done
        done

        if [[ $completed_count -eq 0 ]]; then
            echo "  (none)"
        fi
    fi
}

# ===== SHOW =====
# Show task details
cmd_show() {
    check_env

    local msg_id="${1:-}"

    if [[ -z "$msg_id" ]]; then
        echo "Usage: task show <msg_id>" >&2
        exit 1
    fi

    local base=$(get_instructions_base)

    # Search for the task file
    local found=""
    for task_file in "$base"/*/*/*"$msg_id"*.yaml "$base"/*/*/"$msg_id".yaml; do
        if [[ -f "$task_file" ]]; then
            found="$task_file"
            break
        fi
    done

    if [[ -z "$found" ]]; then
        echo -e "${RED}Task not found: $msg_id${NC}" >&2
        exit 1
    fi

    echo -e "${BLUE}Task Details${NC}"
    echo "File: $found"
    echo "---"
    cat "$found"
}

# ===== HISTORY =====
# Show task history for a project
cmd_history() {
    check_env

    local project="${1:-}"

    if [[ -z "$project" ]]; then
        echo "Usage: task history <project>" >&2
        exit 1
    fi

    local base=$(get_instructions_base)
    local project_dir="$base/$project"

    if [[ ! -d "$project_dir" ]]; then
        echo "No task history for project: $project"
        exit 0
    fi

    echo -e "${BLUE}Task History: $project${NC}"
    echo ""
    printf "%-12s %-10s %-20s %-10s %-20s\n" "MSG_ID" "AGENT" "ASSIGNED" "STATUS" "COMPLETED"
    printf "%-12s %-10s %-20s %-10s %-20s\n" "--------" "------" "--------" "------" "---------"

    for agent_dir in "$project_dir"/*/; do
        [[ -d "$agent_dir" ]] || continue
        local agent=$(basename "$agent_dir")

        for task_file in "$agent_dir"/*.yaml; do
            [[ -f "$task_file" ]] || continue

            python3 -c "
import yaml
from pathlib import Path

data = yaml.safe_load(Path('$task_file').read_text())
msg_id = data.get('msg_id', '?')[:12]
assigned = data.get('assigned', '?')[:20]
status = data.get('status', 'active')
completed = data.get('completed_at', '-')[:20]

print(f'{msg_id:12} {\"$agent\":10} {assigned:20} {status:10} {completed:20}')
" 2>/dev/null || true
        done
    done | sort -k3
}

# ===== CURRENT =====
# Show agent's current task
cmd_current() {
    check_env

    local agent="${1:-${AGENT_NAME:-}}"

    if [[ -z "$agent" ]]; then
        echo "Usage: task current [agent]" >&2
        echo "(or set AGENT_NAME environment variable)" >&2
        exit 1
    fi

    # Find current symlink (searches across all teams)
    local current_link=$(find_agent_current_symlink "$agent")

    if [[ -z "$current_link" ]] || [[ ! -L "$current_link" ]]; then
        echo "No active task for $agent"
        exit 0
    fi

    local task_file=$(readlink -f "$current_link")

    if [[ ! -f "$task_file" ]]; then
        echo -e "${YELLOW}Warning: Current link points to missing file${NC}" >&2
        echo "Removing stale link..."
        rm -f "$current_link"
        exit 1
    fi

    cmd_show "$(basename "$task_file" .yaml)"
}

# ===== CLEANUP =====
# Clean old completed tasks
cmd_cleanup() {
    check_env

    local days=30
    local dry_run=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --days|-d)
                days="$2"
                shift 2
                ;;
            --dry-run|-n)
                dry_run=true
                shift
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit 1
                ;;
        esac
    done

    local base=$(get_instructions_base)

    if [[ ! -d "$base" ]]; then
        echo "No tasks to clean."
        exit 0
    fi

    echo -e "${BLUE}Cleaning completed tasks older than $days days${NC}"
    [[ "$dry_run" == "true" ]] && echo -e "${YELLOW}(dry run - no files will be deleted)${NC}"
    echo ""

    local count=0
    local now=$(date +%s)
    local cutoff=$((now - days * 86400))

    for task_file in "$base"/*/*/*.yaml; do
        [[ -f "$task_file" ]] || continue

        # Skip if not completed
        local status=$(python3 -c "import yaml; print(yaml.safe_load(open('$task_file')).get('status', 'active'))" 2>/dev/null)
        [[ "$status" != "completed" ]] && continue

        # Check file age
        local file_mtime=$(stat -c %Y "$task_file" 2>/dev/null || echo 0)
        if [[ $file_mtime -lt $cutoff ]]; then
            echo "  Would delete: $task_file"
            ((count++))

            if [[ "$dry_run" == "false" ]]; then
                rm -f "$task_file"
            fi
        fi
    done

    # Clean empty directories
    if [[ "$dry_run" == "false" ]]; then
        find "$base" -type d -empty -delete 2>/dev/null || true
    fi

    echo ""
    if [[ "$dry_run" == "true" ]]; then
        echo "Would delete $count task file(s)"
    else
        echo "Deleted $count task file(s)"
    fi
}

# ===== INIT =====
# Initialize task directories for a team
cmd_init() {
    check_env

    local base=$(get_instructions_base)
    mkdir -p "$base/_current"

    echo -e "${GREEN}✓ Initialized task directories${NC}"
    echo "  Base: $base"
    echo "  Current: $base/_current/"
}

# ===== HELP =====
show_help() {
    cat <<'EOF'
Task Management for Nolan Agents

USAGE:
  task <command> [options]

COMMANDS:
  assign <project> <agent> <phase> <task>
      Assign a new task to an agent (wrapper for assign.sh)

  complete [agent]
      Mark the agent's current task as complete
      Uses AGENT_NAME if not specified

  list [--agent <name>] [--project <name>] [--all]
      List tasks with optional filters
      --all includes completed tasks

  show <msg_id>
      Show detailed task information

  current [agent]
      Show agent's current active task

  history <project>
      Show all tasks for a project (audit trail)

  cleanup [--days <n>] [--dry-run]
      Remove completed tasks older than N days (default: 30)

  init
      Initialize task directories for current team

ENVIRONMENT:
  PROJECTS_DIR   Projects directory (required)
  NOLAN_ROOT     Nolan root directory (required)
  TEAM_NAME      Current team name (required)
  AGENT_NAME     Current agent (optional, for 'complete')

AUDIT TRAIL:
  Tasks are stored in: .state/{team}/instructions/{project}/{agent}/{MSG_ID}.yaml
  Current tasks linked: .state/{team}/instructions/_current/{agent}.yaml

EXAMPLES:
  task assign my-project carl implement "Fix bug in line 42"
  task complete carl
  task list --project my-project
  task history my-project
  task cleanup --days 60 --dry-run
EOF
}

# ===== MAIN =====
case "${1:-help}" in
    assign)
        shift
        cmd_assign "$@"
        ;;
    complete)
        shift
        cmd_complete "$@"
        ;;
    list)
        shift
        cmd_list "$@"
        ;;
    show)
        shift
        cmd_show "$@"
        ;;
    history)
        shift
        cmd_history "$@"
        ;;
    current)
        shift
        cmd_current "$@"
        ;;
    cleanup)
        shift
        cmd_cleanup "$@"
        ;;
    init)
        shift
        cmd_init "$@"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1" >&2
        echo "Run 'task help' for usage." >&2
        exit 1
        ;;
esac
