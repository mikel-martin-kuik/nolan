#!/bin/bash
#
# NOTES.md Template Generator & Validator
#
# Usage:
#   ./notes-template.sh create <project-name>    # Create new NOTES.md from template
#   ./notes-template.sh validate <project-path>  # Validate existing NOTES.md
#   ./notes-template.sh update-status <project-path> <status> [detail]  # Update status
#
# Exit codes:
#   0 - Success
#   1 - Invalid arguments
#   2 - Validation failed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_DIR="${PROJECTS_DIR:-$(dirname "$SCRIPT_DIR")/../projects}"

# Required sections in NOTES.md
REQUIRED_SECTIONS=(
    "## Current Status"
    "## Blockers"
    "## Questions for Product Owner"
    "## Log"
)

# Template for new NOTES.md
create_notes_template() {
    local project_name="$1"
    local project_path="$PROJECTS_DIR/$project_name"
    local notes_file="$project_path/NOTES.md"

    if [[ ! -d "$project_path" ]]; then
        mkdir -p "$project_path"
    fi

    if [[ -f "$notes_file" ]]; then
        echo "ERROR: NOTES.md already exists at $notes_file" >&2
        return 1
    fi

    cat > "$notes_file" <<'EOF'
# Project: <Project Name>

**Project Manager**: Dan
**Started**: $(date +%Y-%m-%d)
**Status**: Pending

## Current Status

**Phase**: Initialization
**Status**: Pending
**Blocking Issues**: None

---

## Blockers

| ID | Severity | Description | Owner | Status |
|----|----------|-------------|-------|--------|
| - | - | - | - | - |

---

## Questions for Product Owner

| ID | Question | Answer | Date |
|----|----------|--------|------|
| - | - | - | - |

---

## Phase History

| Phase | Agent | Start | End | Status | Notes |
|-------|-------|-------|-----|--------|-------|
| Init | Dan | $(date +%Y-%m-%d) | - | Pending | Project created |

---

## Log

### $(date +%Y-%m-%d) - Project Initialized
**Event**: Project created
**Details**: Project directory and NOTES.md initialized
**Next**: Define context.md and assign research to Ana

---

## Next Steps

1. [ ] Create context.md with project objectives
2. [ ] Assign Ana to research phase
3. [ ] Ana completes research.md
4. [ ] Dan reviews research findings

---

**Coordinator**: Dan (Scrum Master)
EOF

    # Replace placeholders
    sed -i "s/<Project Name>/$project_name/g" "$notes_file"

    echo "Created NOTES.md at $notes_file"
}

# Validate NOTES.md structure
validate_notes() {
    local project_path="$1"
    local notes_file="$project_path/NOTES.md"

    if [[ ! -f "$notes_file" ]]; then
        echo "ERROR: NOTES.md not found at $notes_file" >&2
        return 2
    fi

    local content
    content=$(cat "$notes_file")

    local missing=()
    for section in "${REQUIRED_SECTIONS[@]}"; do
        if ! echo "$content" | grep -qF "$section"; then
            missing+=("$section")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "ERROR: Missing required sections in NOTES.md:" >&2
        for m in "${missing[@]}"; do
            echo "  - $m" >&2
        done
        return 2
    fi

    echo "✓ NOTES.md validation passed"
}

# Update status in NOTES.md (programmatic updates)
update_status() {
    local project_path="$1"
    local new_status="$2"
    local status_detail="${3:-}"
    local notes_file="$project_path/NOTES.md"

    if [[ ! -f "$notes_file" ]]; then
        echo "ERROR: NOTES.md not found at $notes_file" >&2
        return 1
    fi

    # Validate status values
    case "$new_status" in
        Complete|InProgress|Pending)
            ;;
        *)
            echo "ERROR: Invalid status. Must be: Complete, InProgress, or Pending" >&2
            return 1
            ;;
    esac

    # Format status based on type
    local status_line
    case "$new_status" in
        Complete)
            if [[ -n "$status_detail" ]]; then
                status_line="**Status**: ✅ Complete - $status_detail"
            else
                status_line="**Status**: ✅ Complete"
            fi
            ;;
        InProgress)
            if [[ -n "$status_detail" ]]; then
                status_line="**Status**: In Progress - $status_detail"
            else
                status_line="**Status**: In Progress"
            fi
            ;;
        Pending)
            status_line="**Status**: Pending"
            ;;
    esac

    # Update the status line in Current Status section
    # Find line number of "## Current Status"
    local status_section_line
    status_section_line=$(grep -n "^## Current Status" "$notes_file" | cut -d: -f1)

    if [[ -z "$status_section_line" ]]; then
        echo "ERROR: '## Current Status' section not found" >&2
        return 2
    fi

    # Find the **Status**: line within the next 10 lines
    local start_line=$((status_section_line + 1))
    local end_line=$((status_section_line + 10))

    # Check if **Status**: exists
    if sed -n "${start_line},${end_line}p" "$notes_file" | grep -q "^\*\*Status\*\*:"; then
        # Update existing status line
        local status_line_num
        status_line_num=$(sed -n "${start_line},${end_line}{/^\*\*Status\*\*:/=}" "$notes_file" | head -1)
        if [[ -n "$status_line_num" ]]; then
            sed -i "${status_line_num}s|^\*\*Status\*\*:.*|$status_line|" "$notes_file"
        fi
    else
        # Insert new status line after "## Current Status"
        sed -i "${status_section_line}a\\
\\
$status_line" "$notes_file"
    fi

    echo "✓ Updated status to: $new_status${status_detail:+ - $status_detail}"
}

# Main command dispatcher
main() {
    local command="${1:-}"

    case "$command" in
        create)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 create <project-name>" >&2
                return 1
            fi
            create_notes_template "$2"
            ;;
        validate)
            if [[ $# -lt 2 ]]; then
                echo "Usage: $0 validate <project-path>" >&2
                return 1
            fi
            validate_notes "$2"
            ;;
        update-status)
            if [[ $# -lt 3 ]]; then
                echo "Usage: $0 update-status <project-path> <Complete|InProgress|Pending> [detail]" >&2
                return 1
            fi
            update_status "$2" "$3" "${4:-}"
            ;;
        *)
            cat >&2 <<EOF
Usage: $0 <command> [arguments]

Commands:
  create <project-name>                           Create new NOTES.md from template
  validate <project-path>                          Validate existing NOTES.md
  update-status <project-path> <status> [detail]   Update project status

Status values: Complete, InProgress, Pending

Examples:
  $0 create my-new-project
  $0 validate $PROJECTS_DIR/my-project
  $0 update-status $PROJECTS_DIR/my-project InProgress "Implementation Phase"
  $0 update-status $PROJECTS_DIR/my-project Complete "Deployed to Production"
EOF
            return 1
            ;;
    esac
}

main "$@"
