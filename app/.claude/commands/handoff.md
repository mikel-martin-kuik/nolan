---
description: Initiate agent handoff with validation checklist
argument-hint: <from-agent> <to-agent>
allowed-tools: Read, Bash(cat:*), Bash(grep:*)
---
# Handoff: $1 → $2

## Project Context
!`if [ -n "$DOCS_PATH" ] && [ -f "$DOCS_PATH/context.md" ]; then head -30 "$DOCS_PATH/context.md"; else echo "No context.md found. Set DOCS_PATH or navigate to project."; fi`

## Current Status
!`if [ -n "$DOCS_PATH" ] && [ -f "$DOCS_PATH/NOTES.md" ]; then grep -A10 "## Current Status" "$DOCS_PATH/NOTES.md" 2>/dev/null || grep -A10 "## Status" "$DOCS_PATH/NOTES.md" 2>/dev/null || echo "No status section found"; else echo "No NOTES.md found"; fi`

## Output File Check
!`case "$1" in ana|Ana) file="research.md";; bill|Bill) file="plan.md";; carl|Carl) file="progress.md";; *) file="unknown";; esac; if [ -n "$DOCS_PATH" ] && [ -f "$DOCS_PATH/$file" ]; then echo "✓ $file exists ($(wc -l < "$DOCS_PATH/$file") lines)"; else echo "✗ $file not found at $DOCS_PATH"; fi`

## Pre-Handoff Checklist

Before handing off to $2, verify:

- [ ] Output file is complete with all required sections
- [ ] No placeholder text or TODOs remain
- [ ] NOTES.md updated with current status
- [ ] Blockers documented if any
- [ ] Summary captures key findings/decisions

### Required Sections by Agent

| From | File | Required Sections |
|------|------|-------------------|
| Ana | research.md | Problem, Findings, Recommendations |
| Bill | plan.md | Overview, Tasks, Risks |
| Carl | progress.md | Status, Changes, Tests |

## Handoff Message Template

Send to $2 using team aliases:

```
HANDOFF: $1 → $2
Project: [project name]
Phase: [phase] complete
Status: COMPLETE | BLOCKED
Output: $DOCS_PATH/[file]
Summary: [2-3 sentence summary]
Blockers: [none | description]
```

## Action

After verification:

1. **Add handoff marker to output file** (REQUIRED - enables stop):
```bash
case "$1" in
  ana|Ana) file="research.md";;
  bill|Bill) file="plan.md";;
  carl|Carl) file="progress.md";;
  enzo|Enzo) file="qa-review.md";;
esac
echo -e "\n---\n**Handoff:** Sent to dan at $(date '+%Y-%m-%d %H:%M')" >> "$DOCS_PATH/$file"
```

2. **Send handoff message to dan:**
```bash
source "$NOLAN_ROOT/app/scripts/team-aliases.sh" && dan 'HANDOFF: $1 → dan | Project: [name] | Status: COMPLETE | Output: $DOCS_PATH/[file]'
```

**Note:** The stop hook will block until the handoff marker is added to your output file.
