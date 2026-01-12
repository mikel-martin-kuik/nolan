---
description: Mark a project as complete by clearing active assignment
argument-hint: <project-name>
allowed-tools: Read, Edit, Bash(cat:*), Bash(ls:*), Bash(python3:*)
---
# Close Project: $1

!`agent="${AGENT_NAME:-}"; if [[ "$agent" == "ralph" ]] || [[ "$agent" =~ ^ralph- ]]; then exit 0; fi; coord=$(python3 -c "
import yaml, os, sys
from pathlib import Path
nolan_data_root = Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))
team_name = os.environ.get('TEAM_NAME', 'default')
config_path = next((nolan_data_root / 'teams').rglob(f'{team_name}.yaml'), None)
if not config_path:
    print(f'ERROR: Team config not found: {team_name}', file=sys.stderr)
    sys.exit(1)
c = yaml.safe_load(config_path.read_text())
coord = c.get('team', {}).get('workflow', {}).get('coordinator')
if not coord:
    print(f'ERROR: No coordinator in team config: {team_name}', file=sys.stderr)
    sys.exit(1)
print(coord)
" 2>/dev/null); if [[ -z "$coord" ]]; then echo "ERROR: Could not determine coordinator."; exit 1; fi; if [ "$agent" != "$coord" ]; then echo "ERROR: This command is restricted."; exit 1; fi`

## Project Verification
!`docs_path="$PROJECTS_DIR/$1"; if [ ! -d "$docs_path" ]; then echo "ERROR: Project directory not found: $docs_path"; exit 1; fi; echo "Project: $1"; echo "Path: $docs_path"; ls -la "$docs_path"/*.md 2>/dev/null || echo "No markdown files found"`

## Coordinator File Detection
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml,sys; from pathlib import Path; import os; d=yaml.safe_load((Path('$docs_path')/'.team').read_text()); t=d['team'] if isinstance(d,dict) and 'team' in d else str(d).strip(); cp=next((Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))/'teams').rglob(f'{t}.yaml'),None); c=yaml.safe_load(cp.read_text()) if cp else sys.exit(1); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); echo "Coordinator file: $coord_file"`

## Current Assignment Status
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml,sys; from pathlib import Path; import os; d=yaml.safe_load((Path('$docs_path')/'.team').read_text()); t=d['team'] if isinstance(d,dict) and 'team' in d else str(d).strip(); cp=next((Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))/'teams').rglob(f'{t}.yaml'),None); c=yaml.safe_load(cp.read_text()) if cp else sys.exit(1); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); coord_path="$docs_path/$coord_file"; if [ -f "$coord_path" ]; then if grep -q "## Current Assignment" "$coord_path"; then echo "Active assignment found:"; grep -A2 "## Current Assignment" "$coord_path" | head -5; else echo "No active assignment"; fi; else echo "No coordinator file found: $coord_file"; fi`

## Task History (Audit Trail)
!`"${NOLAN_ROOT}/app/scripts/task.sh" history "$1" 2>/dev/null || echo "No task history found"`

## Pending Handoffs Check
!`pending=$(find "${NOLAN_DATA_ROOT:-$HOME/.nolan}/.state/handoffs/pending" -name "*.handoff" -exec grep -l "project: $1" {} \; 2>/dev/null | wc -l); if [ "$pending" -gt 0 ]; then echo "WARNING: $pending pending handoff(s) for this project"; echo "Run /handoff to review before closing."; else echo "No pending handoffs"; fi`

## Close Project Instructions

To mark **$1** as complete:

1. **Clear the Current Assignment section** in the coordinator file (remove the entire section from `## Current Assignment` to the `---` separator).

2. **Update Current Status**:

```markdown
## Current Status

**Phase**: Complete
**Status**: All phases finished
```

The backend determines project completion by checking if all required workflow files exist with their required headers. No markers needed.

## Post-Closure

After closing, the project will:
- Show as complete in the dashboard (based on file inspection)
- Be hidden from active project lists
- Remain viewable via `/project-status $1`
