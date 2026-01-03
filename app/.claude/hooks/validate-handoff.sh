#!/bin/bash
#
# PreToolUse hook: Validates handoff document structure before Write.
#
# Exit codes:
#   0 - Allow write
#   2 - Block write (missing sections)
#
# Input (stdin): JSON with tool_name, tool_input
# Output (stderr): Error message on block

set -euo pipefail

# Read JSON input
data=$(cat)

# Extract file path and content
file_path=$(echo "$data" | jq -r '.tool_input.file_path // empty')
content=$(echo "$data" | jq -r '.tool_input.content // empty')

# Skip if not a handoff document
if [[ -z "$file_path" ]] || [[ -z "$content" ]]; then
    exit 0
fi

# Function to check required sections
check_sections() {
    local content="$1"
    shift
    local missing=()

    for section in "$@"; do
        if ! echo "$content" | grep -q "$section"; then
            missing+=("$section")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Missing required sections:" >&2
        for m in "${missing[@]}"; do
            echo "  - $m" >&2
        done
        exit 2
    fi
}

# Validate based on filename
case "$file_path" in
    */research.md)
        check_sections "$content" "## Problem" "## Findings" "## Recommendations"
        ;;
    */plan.md)
        check_sections "$content" "## Overview" "## Tasks" "## Risks"
        ;;
    */progress.md)
        check_sections "$content" "## Status" "## Changes"
        ;;
    */NOTES.md)
        check_sections "$content" "## Current Status" "## Log"
        ;;
    */qa-review.md)
        check_sections "$content" "## Summary" "## Findings" "## Recommendation"
        ;;
esac

# All checks passed
exit 0
