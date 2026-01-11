#!/bin/bash
# Cron job: Detect stuck phases and orphaned handoffs
# Schedule: */15 * * * * /path/to/workflow-monitor.sh
#
# This script monitors the Nolan workflow system for:
# 1. Stuck phases (active project files > 4 hours old)
# 2. Orphaned handoffs (pending > 30 minutes)
#
# When issues are detected:
# - Logs to .state/incidents.log
# - Sends desktop notification via notify-send

set -euo pipefail

# Use NOLAN_DATA_ROOT for data paths (with fallback to ~/.nolan)
NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"
STATE_DIR="$NOLAN_DATA_ROOT/.state"
INCIDENT_LOG="$STATE_DIR/incidents.log"

# Ensure state directory exists
mkdir -p "$(dirname "$INCIDENT_LOG")"

log_incident() {
    local event_type="$1"
    local details="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $event_type | $details" >> "$INCIDENT_LOG"
}

# Check for stuck phases (active project files > 4 hours old)
check_stuck_phases() {
    local stuck_count=0

    # Check all team directories for active-*.txt files
    for team_dir in "$STATE_DIR"/*/; do
        if [[ ! -d "$team_dir" ]]; then
            continue
        fi

        local team_name
        team_name=$(basename "$team_dir")

        # Skip non-team directories
        if [[ "$team_name" == "handoffs" ]] || [[ "$team_name" == "scheduler" ]]; then
            continue
        fi

        for state_file in "$team_dir"active-*.txt; do
            if [[ -f "$state_file" ]]; then
                local age_minutes
                age_minutes=$(( ($(date +%s) - $(stat -c %Y "$state_file" 2>/dev/null || echo 0)) / 60 ))

                if [[ $age_minutes -gt 240 ]]; then  # 4 hours = 240 minutes
                    local agent
                    agent=$(basename "$state_file" | sed 's/active-//;s/.txt//')
                    local project
                    project=$(cat "$state_file" 2>/dev/null || echo "unknown")

                    log_incident "STUCK_PHASE" "$team_name/$agent | $project | active for ${age_minutes}m"
                    notify-send "Nolan: Stuck Phase" "$agent on $project for ${age_minutes}m" 2>/dev/null || true
                    ((stuck_count++)) || true
                fi
            fi
        done
    done

    if [[ $stuck_count -gt 0 ]]; then
        echo "Found $stuck_count stuck phase(s)"
    fi
}

# Check for orphaned handoffs (pending > 30 minutes)
check_orphaned_handoffs() {
    local orphan_count=0
    local pending_dir="$STATE_DIR/handoffs/pending"

    if [[ ! -d "$pending_dir" ]]; then
        return
    fi

    for handoff in "$pending_dir"/*.handoff; do
        if [[ -f "$handoff" ]]; then
            local age_minutes
            age_minutes=$(( ($(date +%s) - $(stat -c %Y "$handoff" 2>/dev/null || echo 0)) / 60 ))

            if [[ $age_minutes -gt 30 ]]; then
                local filename
                filename=$(basename "$handoff")

                log_incident "ORPHANED_HANDOFF" "$filename | pending for ${age_minutes}m"
                notify-send "Nolan: Orphaned Handoff" "$filename pending for ${age_minutes}m" 2>/dev/null || true
                ((orphan_count++)) || true
            fi
        fi
    done

    if [[ $orphan_count -gt 0 ]]; then
        echo "Found $orphan_count orphaned handoff(s)"
    fi
}

# Main execution
main() {
    check_stuck_phases
    check_orphaned_handoffs
}

main "$@"
