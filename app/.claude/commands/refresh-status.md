---
description: Refresh team and project status mid-session
argument-hint: [project-name]
allowed-tools: Read, Bash(cat:*), Bash(ls:*), Bash(find:*), Bash(python3:*)
---
# Refresh Status

## Environment
!`echo "AGENT_NAME=${AGENT_NAME:-not set}"`
!`echo "PROJECTS_DIR=${PROJECTS_DIR:-not set}"`

## Pending Handoffs
!`agent="${AGENT_NAME:-}"; is_ralph=false; [[ "$agent" == "ralph" ]] || [[ "$agent" =~ ^ralph- ]] && is_ralph=true; coordinator=$(python3 -c "import yaml, os; from pathlib import Path; t=os.environ.get('TEAM_NAME','default'); cp=next((Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))/'teams').rglob(f'{t}.yaml'),None); c=yaml.safe_load(cp.read_text()) if cp else exit(1); print(c['team']['workflow']['coordinator'])" 2>/dev/null); if [ -z "$coordinator" ]; then echo "ERROR: Could not determine coordinator"; exit 1; fi; if [ "$agent" != "$coordinator" ] && [ "$is_ralph" != "true" ]; then pending=$(find "${NOLAN_DATA_ROOT:-$HOME/.nolan}/.state/handoffs/pending" -name "*.handoff" -type f 2>/dev/null | wc -l); echo "Pending: $pending"; else for hf in "${NOLAN_DATA_ROOT:-$HOME/.nolan}/.state/handoffs/pending"/*.handoff 2>/dev/null; do [ -f "$hf" ] && cat "$hf" && echo "---"; done || echo "No pending handoffs."; fi`

## Active Projects
!`has_assignment() { local n="$1"; [ ! -f "$n" ] && return 1; grep -q '## Current Assignment' "$n" && grep -q '\*\*Agent\*\*:' "$n" && return 0; return 1; }; get_coord() { python3 -c "import yaml; from pathlib import Path; import os; d=yaml.safe_load((Path('$1')/'.team').read_text()); t=d['team'] if isinstance(d,dict) and 'team' in d else str(d).strip(); cp=next((Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))/'teams').rglob(f'{t}.yaml'),None); c=yaml.safe_load(cp.read_text()) if cp else exit(1); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null; }; active=0; pending=0; for dir in "$PROJECTS_DIR"/*/; do [ -d "$dir" ] || continue; project=$(basename "$dir"); [ "${project:0:1}" = "_" ] && continue; [ "${project:0:1}" = "." ] && continue; coord_file=$(get_coord "$dir"); [ -z "$coord_file" ] && continue; coord_path="$dir/$coord_file"; if has_assignment "$coord_path"; then echo "### $project"; grep -A3 "## Current Assignment" "$coord_path" 2>/dev/null | head -5; echo ""; ((active++)); else ((pending++)); fi; done; [ $pending -gt 0 ] && echo "_${pending} pending projects (no assignment)._"`

## Specific Project: $1
!`if [ -n "$1" ]; then docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; d=yaml.safe_load((Path('$docs_path')/'.team').read_text()); t=d['team'] if isinstance(d,dict) and 'team' in d else str(d).strip(); cp=next((Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))/'teams').rglob(f'{t}.yaml'),None); c=yaml.safe_load(cp.read_text()) if cp else exit(1); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); if [ -f "$docs_path/$coord_file" ]; then echo "### $coord_file"; cat "$docs_path/$coord_file"; else echo "No coordinator file found for $1"; fi; else echo "No project specified. Usage: /refresh-status <project-name>"; fi`

## Recent File Changes (last 2 hours)
!`if [ -n "$1" ]; then find "$PROJECTS_DIR/$1" -name "*.md" -mmin -120 -exec ls -la {} \; 2>/dev/null || echo "No recent changes"; else find "$PROJECTS_DIR" -name "*.md" -mmin -120 -exec ls -la {} \; 2>/dev/null | head -20 || echo "No recent changes"; fi`

## Quick Actions

!`agent="${AGENT_NAME:-}"; is_ralph=false; [[ "$agent" == "ralph" ]] || [[ "$agent" =~ ^ralph- ]] && is_ralph=true; coordinator=$(python3 -c "import yaml, os; from pathlib import Path; t=os.environ.get('TEAM_NAME','default'); cp=next((Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))/'teams').rglob(f'{t}.yaml'),None); c=yaml.safe_load(cp.read_text()) if cp else exit(1); print(c['team']['workflow']['coordinator'])" 2>/dev/null); if [ "$agent" = "$coordinator" ] || [ "$is_ralph" = "true" ]; then echo "- **Manage handoffs:** \\\`/handoff\\\`"; echo "- **View agent pane:** \\\`show-agent <name> 50\\\`"; else echo "- **View agent pane:** \\\`show-agent <name> 50\\\`"; fi`
