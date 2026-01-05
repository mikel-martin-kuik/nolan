---
description: Show current project status from NOTES.md
argument-hint: <project-name>
allowed-tools: Read, Bash(cat:*), Bash(ls:*), Bash(find:*)
---
# Project Status: $1

## Environment
!`echo "DOCS_PATH=$PROJECTS_DIR/$1"`

## Status Detection
!`notes="$PROJECTS_DIR/$1/NOTES.md"; if [ ! -f "$notes" ]; then echo "**Status:** PENDING (no NOTES.md)"; elif grep -q '<!-- PROJECT:STATUS:COMPLETE' "$notes"; then marker=$(grep '<!-- PROJECT:STATUS:' "$notes" | head -1); echo "**Status:** COMPLETE (structured marker)"; echo "Marker: $marker"; elif grep -qiE '\*\*(Status|Phase)\*?\*?:.*\b(COMPLETE|CLOSED|DEPLOYED|PRODUCTION.READY)\b' "$notes"; then echo "**Status:** COMPLETE (detected from content)"; echo "Consider adding structured marker: \`<!-- PROJECT:STATUS:COMPLETE:$(date +%Y-%m-%d) -->\`"; else echo "**Status:** ACTIVE"; fi`

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
