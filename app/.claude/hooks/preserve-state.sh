#!/bin/bash
#
# PreCompact hook: Preserve critical handoff state before compaction.
#
# Exit codes:
#   0 - Success (preserved state added to context)
#
# Output (stdout): Critical state to preserve

# Source shared helpers (non-fatal if missing)
source "$(dirname "$0")/_lib.sh" 2>/dev/null || true

# Use PROJECTS_DIR from environment (REQUIRED - set by launch scripts)
if [[ -z "${PROJECTS_DIR:-}" ]]; then
    echo "## Preserved State (Pre-Compact)"
    echo ""
    echo "ERROR: PROJECTS_DIR environment variable is not set."
    exit 0
fi
PROJECTS_BASE="$PROJECTS_DIR"

# Get current team context
CURRENT_TEAM="${TEAM_NAME:-}"

echo "## Preserved State (Pre-Compact)"
echo ""

# Find most recently modified project (by coordinator file)
latest_coordinator=""
latest_time=0
latest_project=""

for dir in "$PROJECTS_BASE"/*/; do
    [[ -d "$dir" ]] || continue
    project=$(basename "$dir")
    [[ "$project" == _* ]] && continue  # Skip template directories
    [[ "$project" == .* ]] && continue  # Skip hidden directories

    # Filter by team if TEAM_NAME is set
    if [[ -n "$CURRENT_TEAM" ]]; then
        team_file="$dir/.team"
        if [[ -f "$team_file" ]]; then
            project_team=$(cat "$team_file" 2>/dev/null)
            [[ "$project_team" != "$CURRENT_TEAM" ]] && continue
        else
            continue  # Skip projects without .team file
        fi
    fi

    # Get coordinator file from team config
    coordinator_file=$(get_coordinator_file "$dir" 2>/dev/null) || continue
    coordinator_path="$dir$coordinator_file"

    [[ -f "$coordinator_path" ]] || continue
    mtime=$(stat -c %Y "$coordinator_path" 2>/dev/null || stat -f %m "$coordinator_path" 2>/dev/null)
    if [[ $mtime -gt $latest_time ]]; then
        latest_time=$mtime
        latest_coordinator=$coordinator_path
        latest_project=$project
    fi
done

if [[ -n "$latest_coordinator" ]]; then
    docs_path=$(dirname "$latest_coordinator")

    echo "### Active Project: $latest_project"
    echo ""

    # Preserve coordinator file current status
    echo "#### Current Status"
    head -30 "$latest_coordinator"
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
