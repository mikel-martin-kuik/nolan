---
description: Show current project status from NOTES.md
argument-hint: <project-name>
allowed-tools: Read, Bash(cat:*), Bash(ls:*), Bash(find:*)
---
# Project Status: $1

## Environment
!`echo "DOCS_PATH=$PROJECTS_DIR/$1"`

## NOTES.md
!`docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/NOTES.md" ]; then cat "$docs_path/NOTES.md"; else echo "No NOTES.md found at $docs_path"; fi`

## Project Files
!`docs_path="$PROJECTS_DIR/$1"; if [ -d "$docs_path" ]; then ls -la "$docs_path"; else echo "Project directory not found: $docs_path"; fi`

## Recent Activity (last 24h)
!`docs_path="$PROJECTS_DIR/$1"; find "$docs_path" -name "*.md" -mtime -1 -exec ls -la {} \; 2>/dev/null || echo "No recent changes"`

## Quick Reference

| File | Purpose | Agent |
|------|---------|-------|
| context.md | Project scope | All |
| research.md | Ana's findings | Ana |
| plan.md | Bill's implementation plan | Bill |
| qa-review.md | Enzo's QA findings | Enzo |
| progress.md | Carl's implementation status | Carl |
| NOTES.md | Dan's coordination hub | Dan |
