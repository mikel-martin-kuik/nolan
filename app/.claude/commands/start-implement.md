---
description: Initialize implementation phase with plan
argument-hint: <project-name>
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---
# Start Implementation: $1

## Environment Setup
!`if [ -z "$1" ]; then echo "❌ ERROR: No project specified."; echo "Notifying Dan..."; source "$NOLAN_ROOT/app/scripts/team-aliases.sh" 2>/dev/null && send dan "Carl needs project name to start implementation. Which project should I work on?" 2>/dev/null || echo "(Could not reach Dan - ask manually)"; echo ""; echo "⏸️  BLOCKED: Wait for Dan to specify project, then run: /start-implement <project-name>"; exit 1; fi; if [ ! -d "$PROJECTS_DIR/$1" ]; then echo "❌ ERROR: Project '$1' not found in $PROJECTS_DIR"; echo "Available projects:"; ls -1 "$PROJECTS_DIR" | grep -v "^\." | head -10; exit 1; fi; export DOCS_PATH="$PROJECTS_DIR/$1"; mkdir -p "${NOLAN_DATA_ROOT:-$HOME/.nolan}/.state/${TEAM_NAME:-default}"; echo "$1" > "${NOLAN_DATA_ROOT:-$HOME/.nolan}/.state/${TEAM_NAME:-default}/active-${AGENT_NAME:-carl}.txt"; echo "✅ DOCS_PATH set to: $DOCS_PATH"`

## Project Context
!`if [ -z "$1" ]; then exit 1; fi; docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/context.md" ]; then head -40 "$docs_path/context.md"; else echo "ERROR: context.md not found at $docs_path"; fi`

## Implementation Plan
!`docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/plan.md" ]; then grep -v '<!-- STATUS:' "$docs_path/plan.md" || cat "$docs_path/plan.md"; else echo "ERROR: plan.md not found. Planning phase must complete first."; fi`

## Current Progress
!`docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/progress.md" ]; then cat "$docs_path/progress.md"; else echo "No progress.md yet - starting fresh."; fi`

## Implementation Phase Instructions

You are Carl, the implementation agent. Your task:

1. **Follow** the plan.md exactly as documented
2. **Execute** tasks in order, respecting dependencies
3. **Track** progress in `$DOCS_PATH/progress.md`

### Output Format: progress.md

```markdown
# [Project] Implementation Progress

**Author:** Carl (Implementation Agent)
**Date:** [today]
**Status:** In Progress | Complete

---

## Status

| Task | Status | Notes |
|------|--------|-------|
| Task 1.1 | Complete | [brief note] |
| Task 1.2 | In Progress | [current state] |
| Task 2.1 | Pending | |

---

## Changes

### [Date/Task]

**File:** `path/to/file.ext`
**Change:** [description]

```diff
- old code
+ new code
```

---

## Tests

- [ ] [Test 1]: [result]
- [ ] [Test 2]: [result]

---

## Blockers

[None | description of blocker and what's needed]

---

*Ready for Dan review and PO approval*
```

### Execution Guidelines

- **Follow the plan:** Don't deviate without updating plan first
- **Update progress:** After each task, update progress.md
- **Test as you go:** Run validation checks per plan
- **Document blockers:** If stuck, document and notify Dan

## When Complete

1. Update progress.md with final status
2. Run validation checks from plan.md
3. Stop - the system handles handoff automatically
