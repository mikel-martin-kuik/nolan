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

## IMPORTANT: Message Sending

⚠️ **DO NOT send a handoff message manually if you will be running /handoff.**

This command handles message sending automatically. If you already sent a message via `dan '...'`,
do NOT run these additional commands.

## Handoff Execution

After verification, complete the handoff in ONE of two ways:

### Option A: RECOMMENDED - Use /handoff skill
```
/handoff $1 $2
```
This automatically:
- Adds handoff marker to your output file
- Sends handoff notification to dan via team-aliases
- No manual message needed

### Option B: Manual (if /handoff skill unavailable)

1. **Add handoff marker to output file:**
```bash
case "$1" in
  ana|Ana) file="research.md";;
  bill|Bill) file="plan.md";;
  carl|Carl) file="progress.md";;
  enzo|Enzo) file="qa-review.md";;
esac
echo -e "\n---\n**Handoff:** Sent to dan at $(date '+%Y-%m-%d %H:%M')" >> "$DOCS_PATH/$file"
```

2. **Send handoff message to dan (ONLY if not using skill):**
```bash
source "$NOLAN_ROOT/app/scripts/team-aliases.sh" && dan 'HANDOFF: $1 → dan | Project: [name] | Status: COMPLETE | Output: $DOCS_PATH/[file]'
```

**Note:** The stop hook will block until the handoff marker is added to your output file.

**Critical:** Do not send the message twice. Choose either the skill OR manual commands, not both.
