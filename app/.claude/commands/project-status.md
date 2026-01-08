---
description: Show current project status from coordinator file
argument-hint: <project-name>
allowed-tools: Read, Bash
---
# Project Status: $1

## Environment
!`echo "DOCS_PATH=$PROJECTS_DIR/$1"`

## Coordinator File Detection
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; t=(Path('$docs_path')/ '.team').read_text().strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); echo "Coordinator file: $coord_file"`

## Status Detection
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; t=(Path('$docs_path')/ '.team').read_text().strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); coord_path="$docs_path/$coord_file"; if [ ! -f "$coord_path" ]; then echo "**Status:** PENDING (no $coord_file)"; elif grep -q '<!-- PROJECT:STATUS:COMPLETE' "$coord_path"; then marker=$(grep '<!-- PROJECT:STATUS:' "$coord_path" | head -1); echo "**Status:** COMPLETE (structured marker)"; echo "Marker: $marker"; elif grep -qiE '\*\*(Status|Phase)\*?\*?:.*\b(COMPLETE|CLOSED|DEPLOYED|PRODUCTION.READY)\b' "$coord_path"; then echo "**Status:** COMPLETE (detected from content)"; echo "Consider adding structured marker: \`<!-- PROJECT:STATUS:COMPLETE:$(date +%Y-%m-%d) -->\`"; else echo "**Status:** ACTIVE"; fi`

## Coordinator File
!`docs_path="$PROJECTS_DIR/$1"; coord_file=$(python3 -c "import yaml; from pathlib import Path; import os; t=(Path('$docs_path')/ '.team').read_text().strip(); c=yaml.safe_load((Path(os.environ['NOLAN_ROOT'])/'teams'/f'{t}.yaml').read_text()); n=c['team']['workflow']['coordinator']; a=next((x for x in c['team']['agents'] if x['name']==n),None); print(a['output_file'])" 2>/dev/null); if [ -f "$docs_path/$coord_file" ]; then cat "$docs_path/$coord_file"; else echo "No $coord_file found at $docs_path"; fi`

## Project Files
!`docs_path="$PROJECTS_DIR/$1"; if [ -d "$docs_path" ]; then ls -la "$docs_path"; else echo "Project directory not found: $docs_path"; fi`

## Recent Activity (last 24h)
!`docs_path="$PROJECTS_DIR/$1"; find "$docs_path" -name "*.md" -mtime -1 -exec ls -la {} \; 2>/dev/null || echo "No recent changes"`
