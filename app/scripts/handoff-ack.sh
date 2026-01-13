#!/bin/bash
#
# Handoff ACK helper - processes pending handoffs from file queue
#
# Usage:
#   handoff-ack list              # List pending handoffs
#   handoff-ack ack <id>          # ACK single handoff by ID (partial match)
#   handoff-ack ack-all           # ACK all pending handoffs
#   handoff-ack show <id>         # Show full handoff details
#   handoff-ack status            # Show handoff system status
#   handoff-ack recover           # Recover stuck handoffs
#
# RESTRICTED: Note-taker and support agents only (not workflow participants)

set -e

# Check if caller is note_taker or support (security check)
check_note_taker_access() {
    local agent_name="${AGENT_NAME:-}"
    local team_name="${TEAM_NAME:-default}"

    # Ralph agents are always allowed (support)
    if [[ "$agent_name" == "ralph" ]] || [[ "$agent_name" =~ ^ralph- ]]; then
        return 0
    fi

    # Query team config for workflow participants (dynamically)
    # Workflow participants cannot use this script - only coordinator and support
    local is_workflow_agent
    is_workflow_agent=$(python3 -c "
import yaml, sys
from pathlib import Path
import os

nolan_data_root = Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))
team_name = os.environ.get('TEAM_NAME', 'default')
agent_name = os.environ.get('AGENT_NAME', '').lower()

if not agent_name:
    sys.exit(0)  # Allow if can't determine

config_path = nolan_data_root / 'teams' / team_name / 'team.yaml'
if not config_path.exists():
    sys.exit(0)  # Allow if config not found

config = yaml.safe_load(config_path.read_text())
agents = config.get('team', {}).get('agents', [])

for agent in agents:
    if agent.get('name', '').lower() == agent_name:
        if agent.get('workflow_participant', False):
            print('yes')
        break
" 2>/dev/null)

    if [[ "$is_workflow_agent" == "yes" ]]; then
        echo "ERROR: This tool is restricted." >&2
        exit 2
    fi
}

# Run access check
check_note_taker_access

# Required environment variables
if [[ -z "${PROJECTS_DIR:-}" ]]; then
    echo "ERROR: PROJECTS_DIR environment variable is not set." >&2
    exit 1
fi
# Use NOLAN_DATA_ROOT for data paths (with fallback to ~/.nolan)
NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"

PENDING_DIR="$NOLAN_DATA_ROOT/.state/handoffs/pending"
PROCESSED_DIR="$NOLAN_DATA_ROOT/.state/handoffs/processed"
LOCK_FILE="$NOLAN_DATA_ROOT/.state/handoffs/.lock-pending"
HEARTBEAT_FILE="$NOLAN_DATA_ROOT/.state/handoffs/.heartbeat"

# Ensure directories exist
mkdir -p "$PENDING_DIR" "$PROCESSED_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Acquire file lock with timeout
acquire_lock() {
    local timeout=${1:-10}

    mkdir -p "$(dirname "$LOCK_FILE")"

    # Open lock file descriptor
    exec 9>"$LOCK_FILE"

    # Try to acquire lock with timeout
    local count=0
    while ! flock -n 9 2>/dev/null; do
        if [[ $count -ge $timeout ]]; then
            echo -e "${RED}ERROR: Failed to acquire lock after ${timeout}s${NC}" >&2
            echo "Another process may be holding the lock. Try again or check for stuck processes." >&2
            return 1
        fi
        sleep 1
        ((count++))
    done

    return 0
}

# Release file lock
release_lock() {
    flock -u 9 2>/dev/null || true
    exec 9>&- 2>/dev/null || true
}

list_handoffs() {
    local count=$(find "$PENDING_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)

    if [[ $count -eq 0 ]]; then
        echo "No pending handoffs."
        return 0
    fi

    echo -e "${YELLOW}Pending Handoffs ($count):${NC}"
    echo ""
    printf "%-14s %-20s %-8s %-20s %-12s\n" "ID" "TIMESTAMP" "FROM" "PROJECT" "TEAM"
    printf "%-14s %-20s %-8s %-20s %-12s\n" "----------" "------------------" "------" "------------------" "----------"

    for handoff_file in "$PENDING_DIR"/*.handoff; do
        [[ -f "$handoff_file" ]] || continue

        python3 -c "
import yaml
with open('$handoff_file') as f:
    d = yaml.safe_load(f)
print(f\"{d.get('id', 'unknown'):14} {d.get('timestamp', 'unknown'):20} {d.get('from_agent', '?'):8} {d.get('project', 'unknown'):20} {d.get('team', 'unknown'):12}\")
" 2>/dev/null || echo "  (failed to parse: $(basename "$handoff_file"))"
    done
}

show_handoff() {
    local id_prefix="$1"

    if [[ -z "$id_prefix" ]]; then
        echo "Usage: handoff-ack show <id>"
        return 1
    fi

    local found=0
    for handoff_file in "$PENDING_DIR"/*.handoff "$PROCESSED_DIR"/*.handoff; do
        [[ -f "$handoff_file" ]] || continue

        if [[ "$(basename "$handoff_file")" == *"$id_prefix"* ]]; then
            local dir_name=$(dirname "$handoff_file")
            local status="PENDING"
            [[ "$dir_name" == "$PROCESSED_DIR" ]] && status="PROCESSED"

            echo -e "${GREEN}Handoff Details:${NC}"
            echo "File: $handoff_file"
            echo "Status: $status"
            echo "---"
            cat "$handoff_file"
            found=1
            break
        fi
    done

    if [[ $found -eq 0 ]]; then
        echo -e "${RED}No handoff found matching: $id_prefix${NC}"
        echo "Searched in: $PENDING_DIR and $PROCESSED_DIR"
        return 1
    fi
}

ack_handoff() {
    local id_prefix="$1"

    if [[ -z "$id_prefix" ]]; then
        echo "Usage: handoff-ack ack <id>"
        return 1
    fi

    # Acquire lock before modifying files
    if ! acquire_lock 10; then
        return 1
    fi

    local found=0
    local error=""

    for handoff_file in "$PENDING_DIR"/*.handoff; do
        [[ -f "$handoff_file" ]] || continue

        if [[ "$(basename "$handoff_file")" == *"$id_prefix"* ]]; then
            local filename=$(basename "$handoff_file")

            # Extract instruction_file path from handoff before moving
            local instruction_file=$(python3 -c "
import yaml
with open('$handoff_file') as f:
    d = yaml.safe_load(f)
print(d.get('instruction_file', ''))
" 2>/dev/null)

            if mv "$handoff_file" "$PROCESSED_DIR/" 2>&1; then
                echo -e "${GREEN}ACK'd: $filename${NC}"
                found=1

                # Extract project and msg_id from handoff for Task Log update
                local project msg_id
                read -r project msg_id < <(python3 -c "
import yaml
with open('$PROCESSED_DIR/$filename') as f:
    d = yaml.safe_load(f)
print(d.get('project', ''), d.get('task_id', d.get('id', '')))
" 2>/dev/null) || true

                # Update instruction file status to 'reviewed'
                if [[ -n "$instruction_file" ]] && [[ -f "$instruction_file" ]]; then
                    local ack_time=$(date +"%Y-%m-%d %H:%M")
                    python3 -c "
import yaml
from pathlib import Path

instr_file = Path('$instruction_file')
content = instr_file.read_text()

# Append ACK info
if 'ack_at:' not in content:
    with open(instr_file, 'a') as f:
        f.write(f'\n# Review\nstatus: reviewed\nack_at: \"$ack_time\"\n')
" 2>/dev/null || true
                fi

                # Update Task Log in note_taker file (mark as Complete)
                if [[ -n "$project" ]] && [[ -n "$msg_id" ]]; then
                    local project_path="$PROJECTS_DIR/$project"
                    if [[ -d "$project_path" ]]; then
                        # Get note_taker file from team config
                        local notes_file
                        notes_file=$(python3 -c "
import yaml, sys
from pathlib import Path
import os

project_path = Path('$project_path')
team_file = project_path / '.team'
if not team_file.exists():
    sys.exit(1)

content = team_file.read_text()
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        team_name = data['team']
    else:
        team_name = content.strip()
except:
    team_name = content.strip()

nolan_data_root = Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))
config_path = nolan_data_root / 'teams' / team_name / 'team.yaml'
if not config_path.exists():
    sys.exit(1)

config = yaml.safe_load(config_path.read_text())
# Try note_taker first (new pattern), fall back to coordinator (legacy)
note_taker = config.get('team', {}).get('workflow', {}).get('note_taker') or config.get('team', {}).get('workflow', {}).get('coordinator')
if not note_taker:
    sys.exit(1)

for agent in config['team']['agents']:
    if agent['name'] == note_taker:
        print(agent.get('output_file', 'NOTES.md'))
        break
" 2>/dev/null) || true

                        if [[ -n "$notes_file" ]] && [[ -f "$project_path/$notes_file" ]]; then
                            # Update Task Log entry from Active to Complete
                            python3 -c "
import re
from pathlib import Path

notes_path = Path('$project_path/$notes_file')
content = notes_path.read_text()

# Update Task Log entry status from Active to Complete
# Pattern: | \`MSG_ID\` | ... | Active |
msg_id = '$msg_id'
pattern = r'(\| \`' + re.escape(msg_id) + r'\` \|[^|]+\|[^|]+\|[^|]+\|) Active (\|)'
replacement = r'\1 Complete \2'
new_content = re.sub(pattern, replacement, content)

if new_content != content:
    notes_path.write_text(new_content)
" 2>/dev/null || true
                        fi
                    fi
                fi
            else
                error="Failed to move file: $handoff_file"
            fi
            break
        fi
    done

    release_lock

    if [[ -n "$error" ]]; then
        echo -e "${RED}ERROR: $error${NC}" >&2
        return 1
    fi

    if [[ $found -eq 0 ]]; then
        echo -e "${RED}No pending handoff found matching: $id_prefix${NC}"
        echo "Use 'handoff-ack list' to see pending handoffs."
        return 1
    fi
}

ack_all() {
    local count=$(find "$PENDING_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)

    if [[ $count -eq 0 ]]; then
        echo "No pending handoffs to ACK."
        return 0
    fi

    # Acquire lock before batch modification
    if ! acquire_lock 10; then
        return 1
    fi

    local success_count=0
    local failure_count=0
    local failed_files=()

    for handoff_file in "$PENDING_DIR"/*.handoff; do
        [[ -f "$handoff_file" ]] || continue

        local filename=$(basename "$handoff_file")

        if mv "$handoff_file" "$PROCESSED_DIR/" 2>/dev/null; then
            ((success_count++))
        else
            ((failure_count++))
            failed_files+=("$filename")
        fi
    done

    release_lock

    if [[ $success_count -gt 0 ]]; then
        echo -e "${GREEN}ACK'd $success_count handoff(s)${NC}"
    fi

    if [[ $failure_count -gt 0 ]]; then
        echo -e "${RED}Failed to ACK $failure_count handoff(s):${NC}" >&2
        for f in "${failed_files[@]}"; do
            echo "  - $f" >&2
        done
        return 1
    fi
}

show_status() {
    echo -e "${BLUE}Handoff System Status${NC}"
    echo "====================="
    echo ""

    # Count files
    local pending_count=$(find "$PENDING_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)
    local processed_count=$(find "$PROCESSED_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)
    local tmp_count=$(find "$PENDING_DIR" -name "*.tmp" -type f 2>/dev/null | wc -l)

    echo "Pending handoffs:   $pending_count"
    echo "Processed handoffs: $processed_count"
    echo "Temp files:         $tmp_count"
    echo ""

    # Check heartbeat
    if [[ -f "$HEARTBEAT_FILE" ]]; then
        local last_heartbeat=$(cat "$HEARTBEAT_FILE")
        local heartbeat_epoch=$(date -d "$last_heartbeat" +%s 2>/dev/null || echo 0)
        local now_epoch=$(date +%s)
        local age=$((now_epoch - heartbeat_epoch))

        echo "Last heartbeat: $last_heartbeat (${age}s ago)"

        if [[ $age -gt 120 ]]; then
            echo -e "${YELLOW}WARNING: Heartbeat is stale (>2 minutes)${NC}"
            echo "Consider running: coordinator-heartbeat.sh --daemon"
        else
            echo -e "${GREEN}Heartbeat is fresh${NC}"
        fi
    else
        echo -e "${YELLOW}No heartbeat recorded${NC}"
        echo "The coordinator heartbeat daemon may not be running."
    fi

    echo ""

    # Check for lock contention
    if [[ -f "$LOCK_FILE" ]]; then
        if flock -n "$LOCK_FILE" -c 'exit 0' 2>/dev/null; then
            echo -e "${GREEN}Lock: Available${NC}"
        else
            echo -e "${YELLOW}Lock: Held by another process${NC}"
        fi
    fi

    echo ""

    # Diagnose issues
    echo -e "${CYAN}Diagnostics:${NC}"

    if [[ $pending_count -gt 0 ]] && [[ ! -f "$HEARTBEAT_FILE" || $age -gt 120 ]]; then
        echo -e "  ${YELLOW}! Pending handoffs but no active coordinator${NC}"
        echo "    Fix: Run 'handoff-ack ack-all' or start coordinator heartbeat"
    fi

    if [[ $tmp_count -gt 0 ]]; then
        echo -e "  ${YELLOW}! Orphaned temp files found${NC}"
        echo "    Fix: Run 'handoff-ack recover'"
    fi

    if [[ $pending_count -eq 0 ]] && [[ $tmp_count -eq 0 ]]; then
        echo -e "  ${GREEN}No issues detected${NC}"
    fi
}

recover_stuck() {
    echo -e "${BLUE}Recovering stuck handoffs...${NC}"
    echo ""

    # Acquire lock
    if ! acquire_lock 10; then
        return 1
    fi

    local recovered=0
    local cleaned=0

    # Clean up orphaned temp files (older than 5 minutes)
    for tmp_file in "$PENDING_DIR"/*.tmp; do
        [[ -f "$tmp_file" ]] || continue

        local file_age=$(( $(date +%s) - $(stat -c %Y "$tmp_file" 2>/dev/null || echo 0) ))

        if [[ $file_age -gt 300 ]]; then
            rm -f "$tmp_file"
            echo "Cleaned orphaned temp file: $(basename "$tmp_file")"
            ((cleaned++))
        fi
    done

    # Check for handoffs stuck in "pending" state for too long (>10 minutes)
    for handoff_file in "$PENDING_DIR"/*.handoff; do
        [[ -f "$handoff_file" ]] || continue

        local file_age=$(( $(date +%s) - $(stat -c %Y "$handoff_file" 2>/dev/null || echo 0) ))

        if [[ $file_age -gt 600 ]]; then
            echo -e "${YELLOW}Stuck handoff (${file_age}s old): $(basename "$handoff_file")${NC}"

            # Auto-ACK stuck handoffs
            if mv "$handoff_file" "$PROCESSED_DIR/" 2>/dev/null; then
                echo -e "  ${GREEN}Auto-ACK'd${NC}"
                ((recovered++))
            else
                echo -e "  ${RED}Failed to recover${NC}"
            fi
        fi
    done

    release_lock

    echo ""
    echo "Recovery complete:"
    echo "  Recovered handoffs: $recovered"
    echo "  Cleaned temp files: $cleaned"
}

case "${1:-list}" in
    list)
        list_handoffs
        ;;
    show)
        show_handoff "$2"
        ;;
    ack)
        ack_handoff "$2"
        ;;
    ack-all)
        ack_all
        ;;
    status)
        show_status
        ;;
    recover)
        recover_stuck
        ;;
    *)
        echo "Handoff ACK Helper"
        echo ""
        echo "Usage:"
        echo "  handoff-ack list              List pending handoffs"
        echo "  handoff-ack show <id>         Show handoff details (searches pending + processed)"
        echo "  handoff-ack ack <id>          ACK single handoff (partial ID match)"
        echo "  handoff-ack ack-all           ACK all pending handoffs"
        echo "  handoff-ack status            Show system status and diagnostics"
        echo "  handoff-ack recover           Recover stuck handoffs and clean temp files"
        echo ""
        echo "Required Environment Variables:"
        echo "  NOLAN_DATA_ROOT - Nolan data directory (defaults to ~/.nolan)"
        echo "  PROJECTS_DIR    - Projects directory"
        ;;
esac
