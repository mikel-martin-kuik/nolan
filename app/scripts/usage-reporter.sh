#!/bin/bash
# usage-reporter.sh - Generates comprehensive token usage reports

set -euo pipefail

# Dependency check
if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not installed." >&2
    echo "Install with: sudo apt install jq" >&2
    exit 1
fi

USAGE_LOG="${HOME}/.claude/agent-usage.jsonl"
REPORT_DIR="${HOME}/.claude/usage-reports"

mkdir -p "$REPORT_DIR"

rotate_logs() {
    local log_dir="${HOME}/.claude"
    local max_age_days=7

    echo "Rotating logs older than $max_age_days days..."
    find "$log_dir" -name "*.jsonl" -mtime +$max_age_days -delete 2>/dev/null || true
    find "${HOME}/.claude/token-reports" -name "*.txt" -mtime +$max_age_days -delete 2>/dev/null || true
    find "${HOME}/.claude/usage-reports" -name "*.csv" -mtime +$max_age_days -delete 2>/dev/null || true

    echo "Log rotation complete"
}

generate_summary() {
    echo "=== Token Usage Summary ==="
    echo "Generated: $(date -Iseconds)"
    echo ""

    if [[ ! -f "$USAGE_LOG" ]]; then
        echo "No usage data found. Run 'capture-usage.sh all' first."
        return 1
    fi

    echo "Agent          | Input Tokens | Output Tokens | Cost (USD)"
    echo "---------------|--------------|---------------|------------"

    for agent in ana bill carl dan enzo; do
        local stats=$(jq -s --arg agent "$agent" '
            map(select(.agent == $agent)) |
            {
                input: (map(.input_tokens) | add // 0),
                output: (map(.output_tokens) | add // 0),
                cost: (map(.cost_usd) | add // 0)
            }
        ' "$USAGE_LOG")

        local input=$(echo "$stats" | jq '.input')
        local output=$(echo "$stats" | jq '.output')
        local cost=$(echo "$stats" | jq '.cost')

        printf "%-14s | %12s | %13s | \$%9.4f\n" \
            "${agent^}" "$input" "$output" "$cost"
    done

    echo ""

    # Totals
    local totals=$(jq -s '{
        input: (map(.input_tokens) | add // 0),
        output: (map(.output_tokens) | add // 0),
        cost: (map(.cost_usd) | add // 0)
    }' "$USAGE_LOG")

    local total_input=$(echo "$totals" | jq '.input')
    local total_output=$(echo "$totals" | jq '.output')
    local total_cost=$(echo "$totals" | jq '.cost')

    echo "---------------|--------------|---------------|------------"
    printf "%-14s | %12s | %13s | \$%9.4f\n" \
        "TOTAL" "$total_input" "$total_output" "$total_cost"
}

generate_hourly_breakdown() {
    local date="${1:-$(date +%Y-%m-%d)}"

    echo "=== Hourly Breakdown - $date ==="
    echo ""

    local start_ts=$(date -d "$date 00:00:00" +%s)000
    local end_ts=$(date -d "$date 23:59:59" +%s)999

    jq -r --argjson start "$start_ts" --argjson end "$end_ts" '
        select(.timestamp >= $start and .timestamp <= $end) |
        [
            (.timestamp / 1000 | strftime("%H:00")),
            .agent,
            .input_tokens,
            .output_tokens,
            .cost_usd
        ] | @tsv
    ' "$USAGE_LOG" 2>/dev/null | sort | \
    while IFS=$'\t' read -r hour agent input output cost; do
        printf "[%s] %-6s: in=%s, out=%s, \$%.4f\n" \
            "$hour" "$agent" "$input" "$output" "$cost"
    done
}

export_csv() {
    local output_file="${REPORT_DIR}/usage-$(date +%Y%m%d-%H%M%S).csv"

    echo "timestamp,agent,input_tokens,output_tokens,cost_usd" > "$output_file"
    jq -r '[.timestamp, .agent, .input_tokens, .output_tokens, .cost_usd] | @csv' \
        "$USAGE_LOG" >> "$output_file"

    echo "Exported to: $output_file"
}

# CLI
case "${1:-}" in
    summary)
        generate_summary
        ;;
    hourly)
        generate_hourly_breakdown "${2:-}"
        ;;
    csv)
        export_csv
        ;;
    rotate)
        rotate_logs
        ;;
    *)
        echo "Usage: usage-reporter.sh <command>"
        echo ""
        echo "Commands:"
        echo "  summary        Show total usage by agent"
        echo "  hourly [date]  Show hourly breakdown"
        echo "  csv            Export to CSV file"
        echo "  rotate         Delete logs older than 7 days"
        ;;
esac
