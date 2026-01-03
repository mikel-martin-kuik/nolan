---
name: agent-handoff
description: Standardized handoff between R&D agents. Use when completing a phase and preparing work for the next agent (Ana->Bill, Bill->Carl, or Carl->Done).
---

# Agent Handoff Protocol

Protocol for transitioning work between R&D agents with validation.

## Workflow

```
Ana (research) -> [Dan Review] -> [PO Approval] -> Bill (planning)
Bill (planning) -> [Dan Review] -> [PO Approval] -> Carl (implementation)
Carl (implementation) -> [Dan Review] -> [PO Approval] -> Done
```

## Quick Reference

### Handoff Message Format

```
HANDOFF: [From] -> [To]
Project: [name]
Phase: [completed phase]
Status: COMPLETE|BLOCKED
Output: [path to output file]
Summary: [2-3 sentences]
Blockers: [if any]
```

### Send Handoff

```bash
source "$NOLAN_ROOT/app/scripts/team-aliases.sh"
dan "HANDOFF: Ana -> Bill ..."  # For review
bill "Starting planning phase"   # Direct to next agent
```

### Required Outputs by Phase

| Phase | Agent | Output File | Required Sections |
|-------|-------|-------------|-------------------|
| Research | Ana | research.md | `## Problem`, `## Findings`, `## Recommendations` |
| Planning | Bill | plan.md | `## Overview`, `## Tasks`, `## Risks` |
| Implementation | Carl | progress.md | `## Status`, `## Changes` |

## Before Handoff

See [CHECKLIST.md](CHECKLIST.md) for validation criteria.

## Message Templates

See [TEMPLATES.md](TEMPLATES.md) for copy-paste formats.
