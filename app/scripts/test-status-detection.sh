#!/bin/bash
#
# Test status detection across all projects
# Verifies that status parsing matches hook validation patterns
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_DIR="${PROJECTS_DIR:-$(cd "$SCRIPT_DIR/../../projects" 2>/dev/null && pwd || echo "$SCRIPT_DIR/../../projects")}"

echo "Testing status detection across all projects..."
echo "Projects directory: $PROJECTS_DIR"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

total=0
complete=0
in_progress=0
pending=0

for project_dir in "$PROJECTS_DIR"/*/; do
    [[ -d "$project_dir" ]] || continue

    project_name=$(basename "$project_dir")
    notes_file="$project_dir/NOTES.md"

    ((total++))

    if [[ ! -f "$notes_file" ]]; then
        echo -e "${YELLOW}PENDING${NC} $project_name (no NOTES.md)"
        ((pending++))
        continue
    fi

    content=$(cat "$notes_file")

    # Detect status using same patterns as projects.rs
    status="PENDING"
    detail=""

    # Pattern 1: STATUS: IN_PROGRESS or Status: IN_PROGRESS
    if echo "$content" | grep -v "^|" | grep -q "STATUS: IN_PROGRESS\|Status: IN_PROGRESS"; then
        status="IN_PROGRESS"
        detail=$(echo "$content" | grep -v "^|" | grep "STATUS: IN_PROGRESS\|Status: IN_PROGRESS" | head -1 | xargs)
    fi

    # Pattern 2: ## Project Status: CLOSED
    if echo "$content" | grep -qi "^## Project Status:.*CLOSED"; then
        status="COMPLETE"
        detail=$(echo "$content" | grep -i "^## Project Status:.*CLOSED" | head -1 | xargs)
    fi

    # Pattern 3: **Status:** Complete or with deployment indicators
    if echo "$content" | grep -v "^|" | grep -qi "\*\*Status[:\*].*Complete"; then
        line=$(echo "$content" | grep -v "^|" | grep -i "\*\*Status[:\*].*Complete" | head -1 | xargs)
        if echo "$line" | grep -qi "deployed\|production\|closed\|deployment ready\|Complete$\|✓"; then
            status="COMPLETE"
            detail="$line"
        elif echo "$line" | grep -qi "in progress\|phase"; then
            status="IN_PROGRESS"
            detail="$line"
        fi
    fi

    # Pattern 4: **Phase:** with indicators
    if echo "$content" | grep -v "^|" | grep -qi "\*\*Phase[:\*]\|\*\*Current Phase[:\*]"; then
        line=$(echo "$content" | grep -v "^|" | grep -i "\*\*Phase[:\*]\|\*\*Current Phase[:\*]" | head -1 | xargs)
        if echo "$line" | grep -qi "complete.*\(deployed\|production\|closed\|refactor\|approved\)"; then
            status="COMPLETE"
            detail="$line"
        elif echo "$line" | grep -qi "research\|planning\|implementation\|qa\|enhancement"; then
            status="IN_PROGRESS"
            detail="$line"
        fi
    fi

    # Pattern 5: **Assigned:** with agent name
    if echo "$content" | grep -v "^|" | grep -qi "\*\*Assigned[:\*].*\(ana\|bill\|carl\|enzo\|ralph\)"; then
        status="IN_PROGRESS"
        detail=$(echo "$content" | grep -v "^|" | grep -i "\*\*Assigned[:\*]" | head -1 | xargs)
    fi

    # Pattern 6: ## Status: header
    if echo "$content" | grep -qi "^## Status:.*\(closed\|complete\)" && ! echo "$content" | grep -qi "^## Status:.*phase"; then
        status="COMPLETE"
        detail=$(echo "$content" | grep -i "^## Status:" | head -1 | xargs)
    fi
    if echo "$content" | grep -qi "^## Status:.*\(approved\|phase\|progress\|in progress\)"; then
        status="IN_PROGRESS"
        detail=$(echo "$content" | grep -i "^## Status:" | head -1 | xargs)
    fi

    # Output results
    case "$status" in
        COMPLETE)
            echo -e "${GREEN}COMPLETE${NC} $project_name"
            ((complete++))
            ;;
        IN_PROGRESS)
            echo -e "${YELLOW}IN_PROGRESS${NC} $project_name"
            ((in_progress++))
            ;;
        PENDING)
            echo -e "${RED}PENDING${NC} $project_name (has NOTES.md but no clear status)"
            ((pending++))
            ;;
    esac

    if [[ -n "$detail" ]]; then
        echo "  └─ $detail"
    fi
done

echo ""
echo "Summary:"
echo "  Total: $total"
echo -e "  ${GREEN}Complete: $complete${NC}"
echo -e "  ${YELLOW}In Progress: $in_progress${NC}"
echo -e "  ${RED}Pending: $pending${NC}"
