#!/bin/bash
# capture-usage.sh - Captures /usage output from agent sessions

set -euo pipefail

# Dependency check
if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed." >&2
    echo "Install with: sudo apt install jq" >&2
    exit 1
fi

USAGE_LOG="${HOME}/.claude/agent-usage.jsonl"
DEBUG_LOG="${HOME}/.claude/capture-debug.log"

capture_agent_usage() {
    local agent="$1"
    local session="agent-${agent}"

    if ! tmux has-session -t "$session" 2>/dev/null; then
        return 1
    fi

    # Send /usage command and capture output
    tmux send-keys -t "$session" "/usage" C-m
    sleep 2  # Wait for response

    # Capture pane content (last 50 lines)
    local output=$(tmux capture-pane -t "$session" -p -S -50)

    # Log raw output for debugging (append with timestamp)
    mkdir -p "$(dirname "$DEBUG_LOG")"
    echo "=== $(date -Iseconds) $agent ===" >> "$DEBUG_LOG"
    echo "$output" >> "$DEBUG_LOG"

    # Validate we got expected format
    if ! echo "$output" | grep -qiE '(tokens?:|usage|cost)'; then
        echo "Warning: Unexpected /usage format for $agent (see $DEBUG_LOG)" >&2
        return 1
    fi

    # Parse usage info (format varies, extract key metrics)
    local input_tokens=$(echo "$output" | grep -oP 'Input tokens?:\s*\K[\d,]+' | tr -d ',' | tail -1)
    local output_tokens=$(echo "$output" | grep -oP 'Output tokens?:\s*\K[\d,]+' | tr -d ',' | tail -1)
    local total_cost=$(echo "$output" | grep -oP '\$[\d.]+' | tail -1 | tr -d '$')

    # Log structured entry
    local timestamp=$(date +%s)000
    jq -nc \
        --arg agent "$agent" \
        --argjson ts "$timestamp" \
        --arg input "${input_tokens:-0}" \
        --arg output "${output_tokens:-0}" \
        --arg cost "${total_cost:-0}" \
        '{
            timestamp: $ts,
            agent: $agent,
            input_tokens: ($input | tonumber),
            output_tokens: ($output | tonumber),
            cost_usd: ($cost | tonumber)
        }' >> "$USAGE_LOG"

    echo "[$(date -Iseconds)] ${agent^}: input=${input_tokens:-?}, output=${output_tokens:-?}, cost=\$${total_cost:-?}"
}

capture_all_agents() {
    echo "Capturing usage for all agents..."
    for agent in ana bill carl dan enzo; do
        capture_agent_usage "$agent" 2>/dev/null || echo "  ${agent^}: offline"
    done
}

periodic_capture() {
    local interval="${1:-300}"  # Default: 5 minutes
    echo "Starting periodic capture (every ${interval}s)..."

    while true; do
        capture_all_agents
        sleep "$interval"
    done
}

# CLI
case "${1:-}" in
    agent)
        capture_agent_usage "${2:-dan}"
        ;;
    all)
        capture_all_agents
        ;;
    periodic)
        periodic_capture "${2:-300}"
        ;;
    *)
        echo "Usage: capture-usage.sh <command>"
        echo ""
        echo "Commands:"
        echo "  agent <name>      Capture single agent usage"
        echo "  all               Capture all agents"
        echo "  periodic [secs]   Run periodic captures (default: 300s)"
        ;;
esac
