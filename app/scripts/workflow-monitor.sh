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
# - Wakes up the guardian agent to investigate

set -euo pipefail

# Use NOLAN_DATA_ROOT for data paths (with fallback to ~/.nolan)
NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"
STATE_DIR="$NOLAN_DATA_ROOT/.state"
INCIDENT_LOG="$STATE_DIR/incidents.log"

# Track if we need to wake guardian (only once per run)
GUARDIAN_NEEDS_WAKE=0

# Ensure state directory exists
mkdir -p "$(dirname "$INCIDENT_LOG")"

log_incident() {
    local event_type="$1"
    local details="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] $event_type | $details" >> "$INCIDENT_LOG"
}

# Wake up the guardian agent via tmux message
wake_guardian() {
    local team_name="$1"
    local issue_summary="$2"
    local session_name="agent-${team_name}-guardian"

    # Check if guardian session exists
    if ! tmux has-session -t "$session_name" 2>/dev/null; then
        log_incident "GUARDIAN_OFFLINE" "Cannot wake guardian - session '$session_name' not found"
        return 1
    fi

    # Build wake-up message
    local msg_id="MONITOR_$(date +%H%M%S)"
    local message="${msg_id}: ALERT from workflow-monitor - ${issue_summary}. Please investigate orphaned handoffs and stuck phases."

    # Exit copy mode if active (prevents message from being ignored)
    tmux send-keys -t "$session_name" 'q' 2>/dev/null || true
    sleep 0.1

    # Send the wake-up message
    tmux send-keys -t "$session_name" -l "$message" 2>/dev/null
    tmux send-keys -t "$session_name" 'C-m' 2>/dev/null

    log_incident "GUARDIAN_WOKEN" "Sent alert to guardian: $issue_summary"
    return 0
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
                    GUARDIAN_NEEDS_WAKE=1
                    AFFECTED_TEAM="$team_name"
                fi
            fi
        done
    done

    if [[ $stuck_count -gt 0 ]]; then
        echo "Found $stuck_count stuck phase(s)" >&2
    fi

    echo "$stuck_count"
}

# Check for orphaned handoffs (pending > 30 minutes)
# Also tries to determine team from handoff file content
check_orphaned_handoffs() {
    local orphan_count=0
    local pending_dir="$STATE_DIR/handoffs/pending"

    if [[ ! -d "$pending_dir" ]]; then
        echo "0"
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
                GUARDIAN_NEEDS_WAKE=1

                # Try to extract team name from handoff file
                if [[ -z "${AFFECTED_TEAM:-}" ]]; then
                    local team_from_file
                    team_from_file=$(grep -E "^team:" "$handoff" 2>/dev/null | head -1 | sed 's/team:\s*//' | tr -d ' ')
                    if [[ -n "$team_from_file" ]]; then
                        AFFECTED_TEAM="$team_from_file"
                    fi
                fi
            fi
        fi
    done

    if [[ $orphan_count -gt 0 ]]; then
        echo "Found $orphan_count orphaned handoff(s)" >&2
    fi

    echo "$orphan_count"
}

# Main execution
main() {
    # Initialize tracking variables
    AFFECTED_TEAM="${AFFECTED_TEAM:-default}"
    local stuck_count=0
    local orphan_count=0

    # Run checks (they set GUARDIAN_NEEDS_WAKE and AFFECTED_TEAM as side effects)
    # Use temp files to avoid subshell variable scope issues
    local tmp_stuck tmp_orphan
    tmp_stuck=$(mktemp)
    tmp_orphan=$(mktemp)
    trap "rm -f '$tmp_stuck' '$tmp_orphan'" EXIT

    check_stuck_phases > "$tmp_stuck"
    stuck_count=$(tail -1 "$tmp_stuck")

    check_orphaned_handoffs > "$tmp_orphan"
    orphan_count=$(tail -1 "$tmp_orphan")

    # Wake guardian if any issues detected
    if [[ "$GUARDIAN_NEEDS_WAKE" -eq 1 ]]; then
        local summary="$stuck_count stuck phase(s), $orphan_count orphaned handoff(s)"
        # Don't fail if guardian can't be woken - it's logged as GUARDIAN_OFFLINE
        wake_guardian "$AFFECTED_TEAM" "$summary" || true
    fi
}

main "$@"
