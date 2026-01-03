#!/bin/bash
# token-tracker.sh - Tracks agent activity from history.jsonl

set -euo pipefail

# Dependency check
if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed." >&2
    echo "Install with: sudo apt install jq" >&2
    exit 1
fi

HISTORY_FILE="${HOME}/.claude/history.jsonl"
AGENTS_DIR="${HOME}/nolan/app/agents"
OUTPUT_DIR="${HOME}/.claude/token-reports"

mkdir -p "$OUTPUT_DIR"

parse_agent_activity() {
    local since="${1:-$(date -d '1 hour ago' +%s)000}"

    echo "=== Agent Activity Report ==="
    echo "Since: $(date -d @$((since/1000)) '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Count prompts per agent directory
    for agent in ana bill carl dan enzo; do
        local agent_path="${AGENTS_DIR}/${agent}"
        local count=$(jq -r --arg path "$agent_path" --argjson since "$since" \
            'select(.project == $path and .timestamp >= $since) | .display' \
            "$HISTORY_FILE" 2>/dev/null | wc -l)

        if [[ $count -gt 0 ]]; then
            echo "${agent^}: $count prompts"

            # Show last 3 prompts
            jq -r --arg path "$agent_path" --argjson since "$since" \
                'select(.project == $path and .timestamp >= $since) |
                 "  [\(.timestamp | . / 1000 | strftime("%H:%M"))] \(.display | .[0:60])..."' \
                "$HISTORY_FILE" 2>/dev/null | tail -3
        else
            echo "${agent^}: 0 prompts"
        fi
        echo ""
    done
}

generate_daily_report() {
    local date="${1:-$(date +%Y-%m-%d)}"
    local start_ts=$(date -d "$date 00:00:00" +%s)000
    local end_ts=$(date -d "$date 23:59:59" +%s)999
    local report_file="$OUTPUT_DIR/activity-${date}.txt"

    {
        echo "# Agent Activity Report - $date"
        echo "Generated: $(date -Iseconds)"
        echo ""

        for agent in ana bill carl dan enzo; do
            local agent_path="${AGENTS_DIR}/${agent}"
            echo "## ${agent^}"
            echo ""

            jq -r --arg path "$agent_path" --argjson start "$start_ts" --argjson end "$end_ts" \
                'select(.project == $path and .timestamp >= $start and .timestamp <= $end) |
                 "- [\(.timestamp | . / 1000 | strftime("%H:%M:%S"))] \(.display)"' \
                "$HISTORY_FILE" 2>/dev/null || echo "  (no activity)"

            echo ""
        done
    } > "$report_file"

    echo "Report saved: $report_file"
}

watch_activity() {
    echo "Watching agent activity (Ctrl+C to stop)..."
    tail -f "$HISTORY_FILE" | while read -r line; do
        local project=$(echo "$line" | jq -r '.project // empty')
        local display=$(echo "$line" | jq -r '.display // empty')
        local ts=$(echo "$line" | jq -r '.timestamp // 0')

        # Extract agent from project path
        local agent=$(echo "$project" | grep -oE 'agents/(ana|bill|carl|dan|enzo)' | cut -d/ -f2)

        if [[ -n "$agent" ]]; then
            local time=$(date -d @$((ts/1000)) '+%H:%M:%S')
            echo "[$time] ${agent^}: ${display:0:80}"
        fi
    done
}

# CLI
case "${1:-}" in
    activity|status)
        shift
        parse_agent_activity "${1:-}"
        ;;
    report)
        shift
        generate_daily_report "${1:-}"
        ;;
    watch)
        watch_activity
        ;;
    *)
        echo "Usage: token-tracker.sh <command>"
        echo ""
        echo "Commands:"
        echo "  activity [since_ts]  Show agent activity summary"
        echo "  report [date]        Generate daily activity report"
        echo "  watch                Live-watch agent prompts"
        ;;
esac
