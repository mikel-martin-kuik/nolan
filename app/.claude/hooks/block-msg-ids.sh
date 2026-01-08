#!/bin/bash
#
# PreToolUse hook: Blocks MSG_IDs from being written to project files.
#
# Message IDs (MSG_<SENDER>_<ID>) are ONLY for delivery tracking, not project documentation.
# Format: MSG_USER_abc12345, MSG_DAN_abc12345, MSG_ANA_abc12345, etc.
#
# Allowed locations:
#   - Handoff Log table in coordinator's output file (the | Assigned (MSG_DAN_xxx) | column only)
#   - Current Assignment section: **Assigned**: YYYY-MM-DD (MSG_DAN_xxx)
#
# Blocked locations:
#   - All other content in coordinator's output file (log entries, status, blockers, etc.)
#   - All other project files (context.md, research.md, plan.md, qa-review.md, progress.md)
#   - Any files in projects directory
#
# Exit codes:
#   0 - Allow write
#   2 - Block write (MSG_ID pattern found)

set -euo pipefail

# Source shared helpers
source "$(dirname "$0")/_lib.sh" || true

# Read JSON input (may be empty)
data=$(cat) || true

# Exit early if no input
if [[ -z "$data" ]]; then
    exit 0
fi

# Extract tool name and parameters (use explicit empty string if missing)
tool_name=$(echo "$data" | jq -r '.tool_name // ""') || true
file_path=$(echo "$data" | jq -r '.tool_input.file_path // ""') || true

# Only check Write and Edit tools
if [[ "$tool_name" != "Write" && "$tool_name" != "Edit" ]]; then
    exit 0
fi

# Skip if no file path
if [[ -z "$file_path" ]]; then
    exit 0
fi

# Only check files in projects directory (PROJECTS_DIR required)
if [[ -z "${PROJECTS_DIR:-}" ]]; then
    exit 0  # Can't validate without PROJECTS_DIR
fi
projects_dir="$PROJECTS_DIR"
if [[ "$file_path" != "$projects_dir"* ]]; then
    exit 0
fi

# Get the content being written
if [[ "$tool_name" == "Write" ]]; then
    content=$(echo "$data" | jq -r '.tool_input.content // empty')
elif [[ "$tool_name" == "Edit" ]]; then
    new_string=$(echo "$data" | jq -r '.tool_input.new_string // empty')
    content="$new_string"
fi

# Skip if no content
if [[ -z "$content" ]]; then
    exit 0
fi

# Check for MSG_ pattern (new format: MSG_<SENDER>_<8-hex-chars>)
# Pattern matches: MSG_USER_abc12345, MSG_DAN_abc12345, etc.
if ! echo "$content" | grep -qE 'MSG_[A-Z]+_[a-f0-9]{8}'; then
    # No MSG_ pattern found - allow
    exit 0
fi

# MSG_ pattern found - check if it's in the allowed context (Handoff Log table)
filename=$(basename "$file_path")

# Get project directory from file path
project_dir=$(dirname "$file_path")
# Get coordinator's output file for this project
coordinator_file=$(get_coordinator_file "$project_dir" 2>/dev/null) || coordinator_file=""

if [[ -n "$coordinator_file" && "$filename" == "$coordinator_file" ]]; then
    # For coordinator's output file, allow MSG_IDs in two contexts:
    # 1. Handoff Log table format: | Date | From | To | Phase | Output | Status (MSG_DAN_xxx) |
    # 2. Current Assignment section: **Assigned**: YYYY-MM-DD (MSG_DAN_xxx)

    # Check if the MSG_ID appears in the table cell format
    if echo "$content" | grep -E '\| (Assigned|Complete|Notified) \(MSG_[A-Z]+_[a-f0-9]{8}\) \|' >/dev/null; then
        # MSG_ID is in proper table format - allow
        exit 0
    fi

    # Check if the MSG_ID appears in the Current Assignment section format
    if echo "$content" | grep -E '\*\*Assigned\*\*: [0-9]{4}-[0-9]{2}-[0-9]{2} \(MSG_[A-Z]+_[a-f0-9]{8}\)' >/dev/null; then
        # MSG_ID is in Current Assignment format - allow
        exit 0
    fi

    # MSG_ID found but NOT in allowed formats - block
    echo "BLOCKED: MSG_IDs can only appear in specific formats in $coordinator_file" >&2
    echo "  Found MSG_ pattern outside allowed formats in: $content" >&2
    echo "" >&2
    echo "  Allowed formats:" >&2
    echo "    - Handoff Log table: | Assigned (MSG_DAN_12345678) |" >&2
    echo "    - Current Assignment: **Assigned**: YYYY-MM-DD (MSG_DAN_12345678)" >&2
    echo "  WRONG: 'Assignment Marker: MSG_xxx' or MSG_IDs in other locations" >&2
    exit 2
fi

# For all other project files, block any MSG_ID
echo "BLOCKED: MSG_IDs cannot be written to $filename" >&2
echo "  MSG_IDs are for delivery tracking only, not project documentation" >&2
echo "  Remove all 'Assignment Marker', 'MSG_xxx' references from the content" >&2
exit 2
