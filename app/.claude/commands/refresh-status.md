---
description: Refresh team and project status mid-session
argument-hint: [project-name]
allowed-tools: Read, Bash(cat:*), Bash(ls:*), Bash(find:*)
---
# Refresh Status

## Environment
!`echo "AGENT_NAME=${AGENT_NAME:-not set}"`
!`echo "PROJECTS_DIR=${PROJECTS_DIR:-not set}"`

## Pending Handoffs
!`queue="$PROJECTS_DIR/.handoffs/pending.log"; if [ -f "$queue" ] && [ -s "$queue" ]; then echo "| Timestamp | Agent | Project | Status |"; echo "|-----------|-------|---------|--------|"; cat "$queue" | while IFS='|' read -r ts agent proj status; do [ -n "$ts" ] && echo "| $ts | $agent | $proj | $status |"; done; else echo "No pending handoffs in queue."; fi`

## Active Projects
!`is_complete() { local n="$1"; [ ! -f "$n" ] && return 1; grep -q '<!-- PROJECT:STATUS:COMPLETE' "$n" && return 0; grep -qiE '\*\*(Status|Phase)\*?\*?:.*\b(COMPLETE|CLOSED|DEPLOYED|PRODUCTION.READY)\b' "$n" && return 0; grep -qiE '^##.*Status:.*\b(COMPLETE|CLOSED|DEPLOYED)\b' "$n" && return 0; return 1; }; active=0; complete=0; for dir in "$PROJECTS_DIR"/*/; do [ -d "$dir" ] || continue; project=$(basename "$dir"); [ "${project:0:1}" = "_" ] && continue; notes="$dir/NOTES.md"; if is_complete "$notes"; then ((complete++)); continue; fi; if [ -f "$notes" ]; then status=$(grep -A3 "## Current Status" "$notes" 2>/dev/null | head -4); [ -z "$status" ] && status=$(grep -A3 "^## Status" "$notes" 2>/dev/null | head -4); if [ -n "$status" ]; then echo "### $project"; echo "$status"; echo ""; ((active++)); fi; fi; done; [ $complete -gt 0 ] && echo "_${complete} completed projects hidden._"`

## Specific Project: $1
!`if [ -n "$1" ]; then docs_path="$PROJECTS_DIR/$1"; if [ -f "$docs_path/NOTES.md" ]; then echo "### NOTES.md"; cat "$docs_path/NOTES.md"; else echo "No NOTES.md found for $1"; fi; else echo "No project specified. Usage: /refresh-status <project-name>"; fi`

## Recent File Changes (last 2 hours)
!`if [ -n "$1" ]; then find "$PROJECTS_DIR/$1" -name "*.md" -mmin -120 -exec ls -la {} \; 2>/dev/null || echo "No recent changes"; else find "$PROJECTS_DIR" -name "*.md" -mmin -120 -exec ls -la {} \; 2>/dev/null | head -20 || echo "No recent changes"; fi`

## Quick Actions

- **Clear handoff queue:** `rm "$PROJECTS_DIR/.handoffs/pending.log"`
- **View agent pane:** `show-agent <name> 50`
- **Check delivery:** `check-delivery <agent> <msg_id>`
