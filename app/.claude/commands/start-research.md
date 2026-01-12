---
description: Initialize research phase with project context
argument-hint: <project-name>
allowed-tools: Read, Glob, Grep, Bash(cat:*), Bash(ls:*)
---
# Start Research: $1

## Environment Setup
!`if [ -z "$1" ]; then echo "❌ ERROR: No project specified."; echo "Notifying Dan..."; source "$NOLAN_ROOT/app/scripts/team-aliases.sh" 2>/dev/null && send dan "Ana needs project name to start research. Which project should I work on?" 2>/dev/null || echo "(Could not reach Dan - ask manually)"; echo ""; echo "⏸️  BLOCKED: Wait for Dan to specify project, then run: /start-research <project-name>"; exit 1; fi; if [ ! -d "$PROJECTS_DIR/$1" ]; then echo "❌ ERROR: Project '$1' not found in $PROJECTS_DIR"; echo "Available projects:"; ls -1 "$PROJECTS_DIR" | grep -v "^\." | head -10; exit 1; fi; export DOCS_PATH="$PROJECTS_DIR/$1"; mkdir -p "${NOLAN_DATA_ROOT:-$HOME/.nolan}/.state/${TEAM_NAME:-default}"; echo "$1" > "${NOLAN_DATA_ROOT:-$HOME/.nolan}/.state/${TEAM_NAME:-default}/active-${AGENT_NAME:-ana}.txt"; echo "✅ DOCS_PATH set to: $DOCS_PATH"`

## Project Context
!`if [ -z "$1" ]; then exit 1; fi; docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/context.md" ]; then cat "$docs_path/context.md"; else echo "ERROR: context.md not found at $docs_path"; echo "Create context.md first with project objective and scope."; fi`

## Existing Files
!`docs_path="$PROJECTS_DIR/$1"; ls -la "$docs_path" 2>/dev/null || echo "Project directory not found: $docs_path"`

## Research Phase Instructions

You are Ana, the research agent. Your task:

1. **Read** context.md thoroughly to understand the objective
2. **Investigate** using allowed tools (Read, Glob, Grep, Bash for read-only commands)
3. **Document** findings in `$DOCS_PATH/research.md`

### Output Format: research.md

```markdown
# [Topic] - Research Findings

**Author:** Ana (Research Agent)
**Date:** [today]
**Status:** Complete

---

## Problem

[What problem are we solving? Why does it matter?]

---

## Findings

### [Finding 1]
[Details, evidence, implications]

### [Finding 2]
[Details, evidence, implications]

---

## Recommendations

| Priority | Recommendation | Effort | Impact |
|----------|---------------|--------|--------|
| 1 | [action] | [estimate] | [High/Med/Low] |
| 2 | [action] | [estimate] | [High/Med/Low] |

---

*Ready for Dan review and PO approval*
```

### Constraints

- **Read-only:** Do not modify any files except research.md
- **Stay focused:** Only investigate what's in scope per context.md
- **Be thorough:** Include evidence and reasoning for recommendations

## When Complete

1. Update research.md with final findings
2. Stop - the system handles handoff automatically
