---
description: Mark a project as complete with structured status marker
argument-hint: <project-name>
allowed-tools: Read, Edit, Bash(cat:*), Bash(ls:*), Bash(python3:*)
---
# Close Project: $1

!`agent="${AGENT_NAME:-}"; if [[ "$agent" == "ralph" ]] || [[ "$agent" =~ ^ralph- ]]; then exit 0; fi; coord=$(python3 -c "import yaml, os; c=yaml.safe_load(open(os.environ['NOLAN_ROOT']+'/teams/'+os.environ.get('TEAM_NAME','default')+'.yaml')); print(c['team']['workflow']['coordinator'])" 2>/dev/null || echo "dan"); if [ "$agent" != "$coord" ]; then echo "ERROR: This command is restricted."; exit 1; fi`

## Project Verification
!`docs_path="$PROJECTS_DIR/$1"; if [ ! -d "$docs_path" ]; then echo "ERROR: Project directory not found: $docs_path"; exit 1; fi; echo "Project: $1"; echo "Path: $docs_path"; ls -la "$docs_path"/*.md 2>/dev/null || echo "No markdown files found"`

## Coordinator File Detection
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; t=(Path('$docs_path')/ '.team').read_text().strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); echo "Coordinator file: $coord_file"`

## Current Status
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; t=(Path('$docs_path')/ '.team').read_text().strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); coord_path="$docs_path/$coord_file"; if [ -f "$coord_path" ]; then grep -A5 "## Current Status" "$coord_path" 2>/dev/null || grep -A5 "^## Status" "$coord_path" 2>/dev/null || echo "No status section found"; else echo "No coordinator file found: $coord_file"; fi`

## Existing Markers Check
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; t=(Path('$docs_path')/ '.team').read_text().strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); coord_path="$docs_path/$coord_file"; if [ -f "$coord_path" ]; then if grep -q '<!-- PROJECT:STATUS:' "$coord_path"; then echo "Structured marker found:"; grep '<!-- PROJECT:STATUS:' "$coord_path"; else echo "No structured marker found (will be added)"; fi; fi`

## Close Project Instructions

To mark **$1** as complete:

1. **Update coordinator file** with final status and structured marker:

```markdown
## Current Status

**Phase**: Complete
**Status**: Complete

<!-- PROJECT:STATUS:COMPLETE:$(date +%Y-%m-%d) -->
```

2. **Add the structured marker** at the end of coordinator file if not present:

```bash
# Get coordinator file dynamically
coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; t=(Path('$PROJECTS_DIR/$1')/ '.team').read_text().strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])")
echo "" >> "$PROJECTS_DIR/$1/$coord_file"
echo "<!-- PROJECT:STATUS:COMPLETE:$(date +%Y-%m-%d) -->" >> "$PROJECTS_DIR/$1/$coord_file"
```

3. **Verify closure:**

```bash
coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; t=(Path('$PROJECTS_DIR/$1')/ '.team').read_text().strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])")
grep 'PROJECT:STATUS' "$PROJECTS_DIR/$1/$coord_file"
```

## Post-Closure

After closing, the project will:
- Be hidden from `/refresh-status` and session start status
- Still be viewable via `/project-status $1`
- Show in completed project count
