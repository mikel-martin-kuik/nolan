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
!`case "$1" in ana|Ana) file="research.md";; bill|Bill) file="plan.md";; carl|Carl) file="progress.md";; enzo|Enzo) file="qa-review.md";; *) file="unknown";; esac; if [ -n "$DOCS_PATH" ] && [ -f "$DOCS_PATH/$file" ]; then echo "✓ $file exists ($(wc -l < "$DOCS_PATH/$file") lines)"; else echo "✗ $file not found at $DOCS_PATH"; fi`

## Pre-Handoff Checklist

Before handing off to $2, verify:

- [ ] Output file is complete with all required sections
- [ ] No placeholder text or TODOs remain
- [ ] Blockers documented if any

### Required Sections by Agent

| From | File | Required Sections |
|------|------|-------------------|
| Ana | research.md | Problem, Findings, Recommendations |
| Bill | plan.md | Overview, Tasks, Risks |
| Carl | progress.md | Status, Changes |
| Enzo | qa-review.md | Summary, Findings, Recommendation |
