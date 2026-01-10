---
description: Document and review project blockers
argument-hint: <project-name>
allowed-tools: Read, Bash(cat:*), Bash(grep:*), Bash(python3:*)
---
# Blockers: $1

## Current Blockers from Coordinator File
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; d=yaml.safe_load((Path('$docs_path')/'.team').read_text()); t=d['team'] if isinstance(d,dict) and 'team' in d else str(d).strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); if [ -f "$docs_path/$coord_file" ]; then grep -A20 -i "blocker" "$docs_path/$coord_file" 2>/dev/null || echo "No blockers section found in $coord_file"; else echo "No $coord_file found at $docs_path"; fi`

## Blockers from QA Review
!`docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/qa-review.md" ]; then grep -B2 -A5 "Critical\|High" "$docs_path/qa-review.md" 2>/dev/null || echo "No Critical/High issues in qa-review.md"; else echo "No qa-review.md found"; fi`

## Project Status
!`docs_path="$PROJECTS_DIR/$1"; grep -i "status\|blocked\|waiting" "$docs_path"/*.md 2>/dev/null | head -20 || echo "No status references found"`

## Blocker Documentation Template

When documenting blockers, use this format in coordinator file:

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

1. **New blocker?** Add to coordinator file using template above
2. **Resolved?** Update status to RESOLVED with resolution details
3. **Needs escalation?** Mark as ESCALATED, notify Dan:

```bash
source "$NOLAN_ROOT/app/scripts/team-aliases.sh" && dan "ESCALATION: Blocker in <project-name> requires PO decision"
```
