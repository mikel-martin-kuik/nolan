---
description: Initialize planning phase with research findings
argument-hint: <project-name>
allowed-tools: Read, Glob, Grep, Bash(cat:*), Bash(ls:*)
---
# Start Planning: $1

## Environment Setup
!`if [ -z "$1" ]; then echo "❌ ERROR: No project specified."; echo "Notifying Dan..."; source "$NOLAN_ROOT/app/scripts/team-aliases.sh" 2>/dev/null && send dan "Bill needs project name to start planning. Which project should I work on?" 2>/dev/null || echo "(Could not reach Dan - ask manually)"; echo ""; echo "⏸️  BLOCKED: Wait for Dan to specify project, then run: /start-planning <project-name>"; exit 1; fi; if [ ! -d "$PROJECTS_DIR/$1" ]; then echo "❌ ERROR: Project '$1' not found in $PROJECTS_DIR"; echo "Available projects:"; ls -1 "$PROJECTS_DIR" | grep -v "^\." | head -10; exit 1; fi; export DOCS_PATH="$PROJECTS_DIR/$1"; mkdir -p "$NOLAN_ROOT/.state/${TEAM_NAME:-default}"; echo "$1" > "$NOLAN_ROOT/.state/${TEAM_NAME:-default}/active-${AGENT_NAME:-bill}.txt"; echo "✅ DOCS_PATH set to: $DOCS_PATH"`

## Project Context
!`if [ -z "$1" ]; then exit 1; fi; docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/context.md" ]; then cat "$docs_path/context.md"; else echo "ERROR: context.md not found at $docs_path"; fi`

## Research Findings
!`docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/research.md" ]; then grep -v '<!-- STATUS:' "$docs_path/research.md" || cat "$docs_path/research.md"; else echo "ERROR: research.md not found. Research phase must complete first."; fi`

## Planning Phase Instructions

You are Bill, the planning agent. Your task:

1. **Review** context.md and research.md thoroughly
2. **Design** implementation approach based on findings
3. **Document** plan in `$DOCS_PATH/plan.md`

### Output Format: plan.md

```markdown
# [Project] Implementation Plan

**Author:** Bill (Planning Agent)
**Date:** [today]
**Status:** Ready for Review

---

## Overview

[Problem summary from research]
[Proposed solution approach]

---

## Tasks

### Phase 1: [Phase Name]

**Task 1.1:** [Task description]

**File:** `path/to/file.ext`
**Lines:** [line numbers if modifying]

[Specific instructions, code changes, commands]

**Task 1.2:** [Next task]
...

### Phase 2: [Phase Name]
...

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [risk] | [H/M/L] | [H/M/L] | [mitigation] |

---

## Validation

- [ ] [How to verify implementation works]
- [ ] [Test commands or checks]

---

## Rollback

[How to revert if something goes wrong]

---

*Ready for Dan review and PO approval*
```

### Constraints

- **Read-only:** Do not execute commands, only document them
- **Be specific:** Include file paths, line numbers, exact changes
- **Dependencies:** Mark task dependencies clearly

## When Complete

1. Update plan.md with final implementation plan
2. Stop - the system handles handoff automatically
