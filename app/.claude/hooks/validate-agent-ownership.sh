#!/bin/bash
#
# PreToolUse hook: Blocks Ana/Bill/Enzo from writing outside their lane.
#
# Ownership rules:
#   ana  → research.md only
#   bill → plan.md only
#   enzo → qa-review.md only
#   carl → permissive (implementation files)
#   dan  → permissive (coordination files)
#
# Exit codes:
#   0 - Allow write
#   2 - Block write (ownership violation)

set -euo pipefail

# Read JSON input
data=$(cat)

# Extract file path
file_path=$(echo "$data" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
if [[ -z "$file_path" ]]; then
    exit 0
fi

# Detect agent from tmux session name
get_agent_name() {
    # Try tmux session name first
    if [[ -n "${TMUX:-}" ]]; then
        local session
        session=$(tmux display-message -p '#S' 2>/dev/null || echo "")
        # Extract agent name: agent-ana, agent-bill-2, etc.
        if [[ "$session" =~ ^agent-([a-z]+)(-[0-9]+)?$ ]]; then
            echo "${BASH_REMATCH[1]}"
            return
        fi
    fi
    # Fallback: check AGENT_NAME (team standard) or CLAUDE_AGENT env var
    if [[ -n "${AGENT_NAME:-}" ]]; then
        echo "$AGENT_NAME"
        return
    fi
    if [[ -n "${CLAUDE_AGENT:-}" ]]; then
        echo "$CLAUDE_AGENT"
        return
    fi
    # Unknown agent - allow by default
    echo "unknown"
}

agent=$(get_agent_name)
filename=$(basename "$file_path")

# Ownership validation for restricted agents
case "$agent" in
    ana)
        if [[ "$filename" != "research.md" ]]; then
            echo "BLOCKED: Ana can only write to research.md, not $filename" >&2
            exit 2
        fi
        ;;
    bill)
        if [[ "$filename" != "plan.md" ]]; then
            echo "BLOCKED: Bill can only write to plan.md, not $filename" >&2
            exit 2
        fi
        ;;
    enzo)
        if [[ "$filename" != "qa-review.md" ]]; then
            echo "BLOCKED: Enzo can only write to qa-review.md, not $filename" >&2
            exit 2
        fi
        ;;
    carl|dan|unknown)
        # Permissive - allow all writes
        ;;
esac

exit 0
