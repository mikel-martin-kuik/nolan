#!/bin/bash
#
# Handoff Heartbeat - Periodically ACKs pending handoffs
#
# Usage:
#   coordinator-heartbeat.sh                    # Single run
#   coordinator-heartbeat.sh --daemon           # Run continuously
#   coordinator-heartbeat.sh --daemon --interval 30  # Custom interval
#
# RESTRICTED: Note-taker and support agents only (not workflow participants)

set -e

# Check if caller is note_taker or support (security check)
check_heartbeat_access() {
    local agent_name="${AGENT_NAME:-}"
    local team_name="${TEAM_NAME:-default}"

    # Ralph agents are always allowed (support)
    if [[ "$agent_name" == "ralph" ]] || [[ "$agent_name" =~ ^ralph- ]]; then
        return 0
    fi

    # Query team config for workflow participants (dynamically)
    # Workflow participants cannot use this script - only note_taker and support
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

# Search for team config in data root
config_path = None
for path in (nolan_data_root / 'teams').rglob(f'{team_name}.yaml'):
    config_path = path
    break

if not config_path:
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
check_heartbeat_access

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

# Default interval in seconds (for daemon mode)
DEFAULT_INTERVAL=60

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_info() {
    log "${BLUE}INFO${NC}: $1"
}

log_success() {
    log "${GREEN}SUCCESS${NC}: $1"
}

log_warn() {
    log "${YELLOW}WARN${NC}: $1"
}

log_error() {
    log "${RED}ERROR${NC}: $1" >&2
}

# Ensure directories exist
ensure_dirs() {
    mkdir -p "$PENDING_DIR" "$PROCESSED_DIR"
}

# Acquire file lock with timeout
acquire_lock() {
    local timeout=${1:-10}
    local lock_fd

    mkdir -p "$(dirname "$LOCK_FILE")"

    # Open lock file
    exec 9>"$LOCK_FILE"

    # Try to acquire lock with timeout
    local count=0
    while ! flock -n 9 2>/dev/null; do
        if [[ $count -ge $timeout ]]; then
            log_error "Failed to acquire lock after ${timeout}s"
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

# ACK all pending handoffs
ack_all_handoffs() {
    ensure_dirs

    local pending_count=$(find "$PENDING_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)

    if [[ $pending_count -eq 0 ]]; then
        return 0
    fi

    # Acquire lock
    if ! acquire_lock 10; then
        log_error "Could not acquire lock - another process may be running"
        return 1
    fi

    local success_count=0
    local failure_count=0

    for handoff_file in "$PENDING_DIR"/*.handoff; do
        [[ -f "$handoff_file" ]] || continue

        local filename=$(basename "$handoff_file")

        if mv "$handoff_file" "$PROCESSED_DIR/" 2>/dev/null; then
            ((success_count++))
            log_success "ACK'd: $filename"
        else
            ((failure_count++))
            log_error "Failed to ACK: $filename"
        fi
    done

    release_lock

    if [[ $success_count -gt 0 ]]; then
        log_info "ACK'd $success_count handoff(s)"
    fi

    if [[ $failure_count -gt 0 ]]; then
        log_warn "Failed to ACK $failure_count handoff(s)"
        return 1
    fi

    return 0
}

# Update heartbeat timestamp
update_heartbeat() {
    mkdir -p "$(dirname "$HEARTBEAT_FILE")"
    echo "$(date -Iseconds)" > "$HEARTBEAT_FILE"
}

# Check if heartbeat is stale (older than 2x interval)
check_heartbeat_stale() {
    local max_age=${1:-120}  # Default 2 minutes

    if [[ ! -f "$HEARTBEAT_FILE" ]]; then
        return 0  # No heartbeat file = stale
    fi

    local heartbeat_time=$(cat "$HEARTBEAT_FILE" 2>/dev/null)
    if [[ -z "$heartbeat_time" ]]; then
        return 0  # Empty = stale
    fi

    local heartbeat_epoch=$(date -d "$heartbeat_time" +%s 2>/dev/null)
    local now_epoch=$(date +%s)
    local age=$((now_epoch - heartbeat_epoch))

    if [[ $age -gt $max_age ]]; then
        return 0  # Stale
    fi

    return 1  # Fresh
}

# Single heartbeat run
single_run() {
    log_info "Handoff heartbeat - single run"
    ack_all_handoffs
    update_heartbeat
}

# Daemon mode - continuous heartbeat
daemon_mode() {
    local interval=${1:-$DEFAULT_INTERVAL}

    log_info "Handoff heartbeat daemon starting (interval: ${interval}s)"
    log_info "Press Ctrl+C to stop"

    # Trap SIGINT and SIGTERM for clean shutdown
    trap 'log_info "Shutting down heartbeat daemon"; exit 0' SIGINT SIGTERM

    while true; do
        ack_all_handoffs
        update_heartbeat
        sleep "$interval"
    done
}

# Show status
show_status() {
    ensure_dirs

    local pending_count=$(find "$PENDING_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)
    local processed_count=$(find "$PROCESSED_DIR" -name "*.handoff" -type f 2>/dev/null | wc -l)

    echo -e "${BLUE}Handoff Status${NC}"
    echo "==============="
    echo "Pending:   $pending_count"
    echo "Processed: $processed_count"
    echo ""

    if [[ -f "$HEARTBEAT_FILE" ]]; then
        local last_heartbeat=$(cat "$HEARTBEAT_FILE")
        echo "Last heartbeat: $last_heartbeat"

        if check_heartbeat_stale 120; then
            echo -e "${YELLOW}WARNING: Heartbeat is stale (>2 minutes old)${NC}"
        else
            echo -e "${GREEN}Heartbeat is fresh${NC}"
        fi
    else
        echo -e "${YELLOW}No heartbeat recorded yet${NC}"
    fi

    echo ""

    if [[ $pending_count -gt 0 ]]; then
        echo -e "${YELLOW}Pending Handoffs:${NC}"
        for f in "$PENDING_DIR"/*.handoff; do
            [[ -f "$f" ]] || continue
            echo "  - $(basename "$f")"
        done
    fi
}

# Main
case "${1:-}" in
    --daemon|-d)
        # Parse optional interval: --daemon [-i|--interval] <seconds>
        interval="$DEFAULT_INTERVAL"
        if [[ "${2:-}" == "--interval" || "${2:-}" == "-i" ]] && [[ -n "${3:-}" ]]; then
            interval="$3"
        fi
        daemon_mode "$interval"
        ;;
    --status|-s)
        show_status
        ;;
    --help|-h)
        echo "Handoff Heartbeat - ACKs pending handoffs"
        echo ""
        echo "Usage:"
        echo "  coordinator-heartbeat.sh                    # Single run"
        echo "  coordinator-heartbeat.sh --daemon           # Continuous daemon"
        echo "  coordinator-heartbeat.sh --daemon -i 30     # Custom interval (seconds)"
        echo "  coordinator-heartbeat.sh --status           # Show status"
        echo ""
        echo "Required Environment Variables:"
        echo "  NOLAN_DATA_ROOT - Nolan data directory (defaults to ~/.nolan)"
        echo "  PROJECTS_DIR    - Projects directory"
        ;;
    *)
        single_run
        ;;
esac
