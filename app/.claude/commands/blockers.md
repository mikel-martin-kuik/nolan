---
description: Document and review project blockers
argument-hint: <project-name>
allowed-tools: Read, Bash(cat:*), Bash(grep:*)
---
# Blockers: $1

## Current Blockers from NOTES.md
!`docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/NOTES.md" ]; then grep -A20 -i "blocker" "$docs_path/NOTES.md" 2>/dev/null || echo "No blockers section found in NOTES.md"; else echo "No NOTES.md found at $docs_path"; fi`

## Blockers from QA Review
!`docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/qa-review.md" ]; then grep -B2 -A5 "Critical\|High" "$docs_path/qa-review.md" 2>/dev/null || echo "No Critical/High issues in qa-review.md"; else echo "No qa-review.md found"; fi`

## Project Status
!`docs_path="$PROJECTS_DIR/$1"; grep -i "status\|blocked\|waiting" "$docs_path"/*.md 2>/dev/null | head -20 || echo "No status references found"`

## Blocker Documentation Template

When documenting blockers, use this format in NOTES.md:

```markdown
## Blockers

### [BLOCKER-ID]: [Short Title]
**Status:** OPEN | RESOLVED | ESCALATED
**Reported:** [date]
**Owner:** [agent or person]
**Impact:** [what is blocked]
**Description:** [details]
**Resolution:** [steps needed or taken]
**Escalated to:** [PO if needed]
```

## Actions

After reviewing blockers:

1. **New blocker?** Add to NOTES.md using template above
2. **Resolved?** Update status to RESOLVED with resolution details
3. **Needs escalation?** Mark as ESCALATED, notify Dan:

```bash
source "$NOLAN_ROOT/app/scripts/team-aliases.sh" && dan "ESCALATION: Blocker in <project-name> requires PO decision"
```
