#!/bin/bash
#
# PreToolUse hook: Blocks MSG_IDs from being written to project files.
#
# Message IDs (MSG_xxx) are ONLY for delivery tracking, not project documentation.
#
# Allowed locations:
#   - Handoff Log table in NOTES.md (the | Assigned (MSG_xxx) | column only)
#
# Blocked locations:
#   - All other content in NOTES.md (log entries, status, blockers, etc.)
#   - All other project files (context.md, research.md, plan.md, qa-review.md, progress.md)
#   - Any files in projects directory
#
# Exit codes:
#   0 - Allow write
#   2 - Block write (MSG_ID pattern found)

set -euo pipefail

# Read JSON input
data=$(cat)

# Extract tool name and parameters
tool_name=$(echo "$data" | jq -r '.tool_name // empty')
file_path=$(echo "$data" | jq -r '.tool_input.file_path // empty')

# Only check Write and Edit tools
if [[ "$tool_name" != "Write" && "$tool_name" != "Edit" ]]; then
    exit 0
fi

# Skip if no file path
if [[ -z "$file_path" ]]; then
    exit 0
fi

# Only check files in projects directory
projects_dir="${PROJECTS_DIR:-$HOME/Proyectos/nolan/projects}"
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

# Check for MSG_ pattern
if ! echo "$content" | grep -q 'MSG_[a-f0-9]\{8\}'; then
    # No MSG_ pattern found - allow
    exit 0
fi

# MSG_ pattern found - check if it's in the allowed context (Handoff Log table)
filename=$(basename "$file_path")

if [[ "$filename" == "NOTES.md" ]]; then
    # For NOTES.md, allow MSG_IDs only in the Handoff Log table format:
    # | Date | From | To | Phase | Output | Status (MSG_xxx) |

    # Check if the MSG_ID appears in the table cell format: " | Assigned (MSG_xxx) |" or similar
    if echo "$content" | grep -E '\| (Assigned|Complete|Notified) \(MSG_[a-f0-9]{8}\) \|' >/dev/null; then
        # MSG_ID is in proper table format - allow
        exit 0
    fi

    # MSG_ID found but NOT in table format - block
    echo "BLOCKED: MSG_IDs can only appear in Handoff Log table in NOTES.md" >&2
    echo "  Found MSG_ pattern outside table format in: $content" >&2
    echo "" >&2
    echo "  Correct format: | Assigned (MSG_12345678) |" >&2
    echo "  WRONG: 'Assignment Marker: MSG_xxx' or MSG_IDs in log entries" >&2
    exit 2
fi

# For all other project files, block any MSG_ID
echo "BLOCKED: MSG_IDs cannot be written to $filename" >&2
echo "  MSG_IDs are for delivery tracking only, not project documentation" >&2
echo "  Remove all 'Assignment Marker', 'MSG_xxx' references from the content" >&2
exit 2
