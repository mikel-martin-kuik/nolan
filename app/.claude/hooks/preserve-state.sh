#!/bin/bash
#
# PreCompact hook: Preserve critical handoff state before compaction.
#
# Exit codes:
#   0 - Success (preserved state added to context)
#
# Output (stdout): Critical state to preserve

PROJECTS_BASE="$HOME/nolan/projects"

echo "## Preserved State (Pre-Compact)"
echo ""

# Find most recently modified project
latest_notes=""
latest_time=0

for notes in "$PROJECTS_BASE"/*/NOTES.md; do
    [[ -f "$notes" ]] || continue
    mtime=$(stat -c %Y "$notes" 2>/dev/null || stat -f %m "$notes" 2>/dev/null)
    if [[ $mtime -gt $latest_time ]]; then
        latest_time=$mtime
        latest_notes=$notes
    fi
done

if [[ -n "$latest_notes" ]]; then
    project=$(dirname "$latest_notes" | xargs basename)
    docs_path=$(dirname "$latest_notes")

    echo "### Active Project: $project"
    echo ""

    # Preserve NOTES.md current status
    echo "#### Current Status"
    head -30 "$latest_notes"
    echo ""

    # Preserve key sections from context.md
    if [[ -f "$docs_path/context.md" ]]; then
        echo "#### Project Context"
        head -20 "$docs_path/context.md"
        echo ""
    fi

    # List output files and their status
    echo "#### Output Files"
    for doc in research.md plan.md progress.md; do
        if [[ -f "$docs_path/$doc" ]]; then
            lines=$(wc -l < "$docs_path/$doc")
            echo "- $doc: $lines lines"
        fi
    done
fi

exit 0
