---
description: Initialize QA review phase with document context
argument-hint: <project-name> [document]
allowed-tools: Read, Glob, Grep, Bash(cat:*), Bash(ls:*)
---
# QA Review: $1

## Environment Setup
!`if [ -z "$1" ]; then echo "❌ ERROR: No project specified."; echo "Notifying Dan..."; source "$NOLAN_ROOT/app/scripts/team-aliases.sh" 2>/dev/null && send dan "Enzo needs project name to start QA review. Which project should I review?" 2>/dev/null || echo "(Could not reach Dan - ask manually)"; echo ""; echo "⏸️  BLOCKED: Wait for Dan to specify project, then run: /qa-review <project-name> [document]"; exit 1; fi; if [ ! -d "$PROJECTS_DIR/$1" ]; then echo "❌ ERROR: Project '$1' not found in $PROJECTS_DIR"; echo "Available projects:"; ls -1 "$PROJECTS_DIR" | grep -v "^\." | head -10; exit 1; fi; export DOCS_PATH="$PROJECTS_DIR/$1"; mkdir -p "$NOLAN_ROOT/.state/${TEAM_NAME:-default}"; echo "$1" > "$NOLAN_ROOT/.state/${TEAM_NAME:-default}/active-${AGENT_NAME:-enzo}.txt"; echo "✅ DOCS_PATH set to: $DOCS_PATH"`

## Project Context
!`if [ -z "$1" ]; then exit 1; fi; docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/context.md" ]; then head -50 "$docs_path/context.md"; else echo "ERROR: context.md not found at $docs_path"; fi`

## Document to Review
!`docs_path="$PROJECTS_DIR/$1"; doc=$2; if [ -z "$doc" ]; then doc="plan.md"; fi; if [ -f "$docs_path/$doc" ]; then echo "=== $doc ==="; grep -v '<!-- STATUS:' "$docs_path/$doc" || cat "$docs_path/$doc"; else echo "Document not found: $docs_path/$doc"; echo "Available documents:"; ls -la "$docs_path"/*.md 2>/dev/null || echo "No .md files found"; fi`

## QA Review Instructions

You are Enzo, the QA agent. Your task:

1. **Read** the document thoroughly
2. **Validate** against QA checklist below
3. **Document** findings in `$DOCS_PATH/qa-review.md`

### QA Checklist

- [ ] **Execution:** Code/commands will execute (syntax, dependencies)
- [ ] **Paths:** All paths resolve correctly (`$HOME` not `~`, interpreters specified)
- [ ] **Security:** No injection risks, secrets exposure, or improper escaping
- [ ] **Integration:** Aligns with architecture.md (if exists)
- [ ] **Completeness:** No placeholder text or unfinished items remain
- [ ] **Accuracy:** Claims match evidence/sources

### Severity Levels

| Severity | Definition | Action |
|----------|------------|--------|
| Critical | Won't execute at all | Block until fixed |
| High | Security risk or major bug | Block until fixed |
| Medium | Works but has issues | Proceed, track for fix |
| Low | Style/improvement | Optional fix |

### Output Format: qa-review.md

```markdown
# QA Review: [document]

**Date:** [today]
**Reviewer:** Enzo
**Document:** [project]/[document]
**Author:** [original author]

## Summary

**[N] Critical, [N] High, [N] Medium, [N] Low issues**

Overall quality: [assessment]

---

## Findings

### [Issue Title]
**Severity:** [Critical|High|Medium|Low]
**File:** [filename:line-number]
**Problem:** [description]
**Impact:** [what breaks or fails]
**Fix:** [specific remediation]

---

## Verification Matrix

| Section | Claim | Status |
|---------|-------|--------|
| [section] | [claim] | [VERIFIED|UNVERIFIED|INCORRECT] |

---

## Recommendation

**Status:** [Approved | Requires fixes before handoff | Blocked]

**Required fixes:** (if any)
1. [fix]
2. [fix]

*Ready for Dan review*
```

### Constraints

- **Read-only:** Do not modify reviewed documents
- **Be specific:** Include line numbers and exact issues
- **Severity matters:** Only Critical/High block handoff

## When Complete

1. Update qa-review.md with final findings
2. Stop - the system handles handoff automatically
