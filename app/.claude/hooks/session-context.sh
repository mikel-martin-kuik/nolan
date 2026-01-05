#!/bin/bash
#
# SessionStart hook: Auto-load team status on session start.
#
# Exit codes:
#   0 - Success (output added to context)
#
# Output (stdout): Team status summary

# Use PROJECTS_DIR from environment (set by launch scripts)
PROJECTS_BASE="${PROJECTS_DIR:-$HOME/nolan/projects}"
HANDOFFS_QUEUE="$PROJECTS_BASE/.handoffs/pending.log"

# Header
echo "## Nolan Team Status"
echo ""

# Validate identity
if [[ -z "${AGENT_NAME:-}" ]]; then
    echo "⚠️  WARNING: AGENT_NAME environment variable is not set."
    echo "Your identity has not been reliably established. Status updates may fail validation."
    echo "Identity should be set by the launch environment."
    echo ""
fi

# Show pending handoffs (especially important for Dan)
if [[ -f "$HANDOFFS_QUEUE" ]] && [[ -s "$HANDOFFS_QUEUE" ]]; then
    echo "### ⚠️ Pending Handoffs (Queued)"
    echo ""
    echo "These handoffs were queued because direct delivery failed:"
    echo ""
    echo "| Timestamp | Agent | Project | Status |"
    echo "|-----------|-------|---------|--------|"
    while IFS='|' read -r timestamp agent project status; do
        [[ -z "$timestamp" ]] && continue
        echo "| $timestamp | $agent | $project | $status |"
    done < "$HANDOFFS_QUEUE"
    echo ""

    # If this is Dan, offer to clear the queue
    if [[ "${AGENT_NAME:-}" == "dan" ]]; then
        echo "**Action Required:** Review these handoffs. Clear queue with:"
        echo "\`\`\`bash"
        echo "rm \"$HANDOFFS_QUEUE\""
        echo "\`\`\`"
        echo ""
    fi
fi

# ===== PROJECT STATUS DETECTION (MARKER-ONLY) =====
# Single source of truth: structured markers only
# No heuristics, no legacy pattern matching
#
# Returns via global: PROJECT_STATUS = "complete" | "inprogress" | "pending"
get_project_status() {
    local notes="$1"
    PROJECT_STATUS="pending"

    [[ ! -f "$notes" ]] && return

    # MARKER-ONLY: Check for structured markers
    if grep -q '<!-- PROJECT:STATUS:COMPLETE' "$notes" 2>/dev/null; then
        PROJECT_STATUS="complete"
        return
    fi
    if grep -q '<!-- PROJECT:STATUS:CLOSED' "$notes" 2>/dev/null; then
        PROJECT_STATUS="complete"
        return
    fi
    if grep -q '<!-- PROJECT:STATUS:ARCHIVED' "$notes" 2>/dev/null; then
        PROJECT_STATUS="complete"
        return
    fi
    if grep -q '<!-- PROJECT:STATUS:INPROGRESS' "$notes" 2>/dev/null; then
        PROJECT_STATUS="inprogress"
        return
    fi

    # No marker = pending (explicit marking required)
    PROJECT_STATUS="pending"
}

# Collect projects by status
pending_projects=""
active_count=0
complete_count=0
pending_count=0

for dir in "$PROJECTS_BASE"/*/; do
    [[ -d "$dir" ]] || continue
    project=$(basename "$dir")
    [[ "$project" == _* ]] && continue  # Skip template directories
    [[ "$project" == .* ]] && continue  # Skip hidden directories (.legacy, .state, .handoffs)
    notes="$dir/NOTES.md"

    # Get status from marker
    get_project_status "$notes"

    case "$PROJECT_STATUS" in
        complete)
            ((complete_count++)) || true
            ;;
        inprogress)
            ((active_count++)) || true
            # Show status section
            status=$(grep -A3 "## Current Status" "$notes" 2>/dev/null | head -4)
            [[ -z "$status" ]] && status=$(grep -A3 "^## Status" "$notes" 2>/dev/null | head -4)
            echo "### $project"
            if [[ -n "$status" ]]; then
                echo "$status"
            else
                echo "_In progress (no status section)_"
            fi
            echo ""
            ;;
        pending)
            ((pending_count++)) || true
            pending_projects="$pending_projects$project\n"
            ;;
    esac
done

# Show pending projects (no marker)
if [[ -n "$pending_projects" ]]; then
    pending_clean=$(echo -e "$pending_projects" | grep -v '^$' | sort)
    if [[ -n "$pending_clean" ]]; then
        echo "### Pending (needs marker)"
        echo "$pending_clean"
        echo ""
    fi
fi

# Summary line
echo "---"
if [[ $active_count -eq 0 && $pending_count -eq 0 ]]; then
    echo "All projects complete. ($complete_count total)"
else
    summary=""
    [[ $active_count -gt 0 ]] && summary="${active_count} active"
    [[ $pending_count -gt 0 ]] && summary="${summary}${summary:+, }${pending_count} pending"
    [[ $complete_count -gt 0 ]] && summary="${summary}${summary:+, }${complete_count} complete"
    echo "_${summary}_"
fi

exit 0
