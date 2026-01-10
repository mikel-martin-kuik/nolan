---
description: Show current project status from coordinator file
argument-hint: <project-name>
allowed-tools: Read, Bash
---
# Project Status: $1

## Environment
!`echo "DOCS_PATH=$PROJECTS_DIR/$1"`

## Status Detection
!`python3 "$NOLAN_ROOT/app/scripts/project-status-helper.py" "$1" 2>&1`

## Project Files
!`docs_path="$PROJECTS_DIR/$1"; if [ -d "$docs_path" ]; then ls -la "$docs_path"; else echo "Project directory not found: $docs_path"; fi`

## Recent Activity (last 24h)
!`docs_path="$PROJECTS_DIR/$1"; find "$docs_path" -name "*.md" -mtime -1 -exec ls -la {} \; 2>/dev/null || echo "No recent changes"`
