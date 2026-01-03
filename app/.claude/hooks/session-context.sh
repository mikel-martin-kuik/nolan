#!/bin/bash
#
# SessionStart hook: Auto-load team status on session start.
#
# Exit codes:
#   0 - Success (output added to context)
#
# Output (stdout): Team status summary

PROJECTS_BASE="$HOME/nolan/app/projects"

# Header
echo "## AI RnD Team Status"
echo ""

# Validate identity
if [[ -z "${AGENT_NAME:-}" ]]; then
    echo "⚠️  WARNING: AGENT_NAME environment variable is not set."
    echo "Your identity has not been reliably established. Status updates may fail validation."
    echo "Identity should be set by the launch environment."
    echo ""
fi

# Collect active/pending projects only
pending=""
active_count=0

for dir in "$PROJECTS_BASE"/*/; do
    [[ -d "$dir" ]] || continue
    project=$(basename "$dir")
    [[ "$project" == _* ]] && continue  # Skip template directories
    notes="$dir/NOTES.md"

    # Skip completed projects (Status: Complete)
    if [[ -f "$notes" ]] && grep -q "^\*\*Status:\*\* Complete$" "$notes" 2>/dev/null; then
        continue
    fi

    # Show active/pending project status
    if [[ -f "$notes" ]]; then
        status=$(grep -A3 "## Current Status" "$notes" 2>/dev/null | head -4)
        if [[ -n "$status" ]]; then
            echo "### $project"
            echo "$status"
            echo ""
            ((active_count++))
        fi
    else
        pending="$pending$project\n"
    fi
done

# Show pending projects without NOTES.md
if [[ -n "$pending" ]]; then
    pending_clean=$(echo -e "$pending" | grep -v '^$' | sort)
    if [[ -n "$pending_clean" ]]; then
        echo "### Pending (no NOTES.md)"
        echo "$pending_clean"
        echo ""
    fi
fi

if [[ $active_count -eq 0 && -z "$pending_clean" ]]; then
    echo "All projects complete."
fi

exit 0
