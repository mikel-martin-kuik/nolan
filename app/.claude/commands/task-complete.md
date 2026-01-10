---
description: Mark current task as complete (for workflow agents)
allowed-tools: Bash(task.sh:*), Read
---
# Complete Current Task

## Current Task Status
!`if [ -z "${AGENT_NAME:-}" ]; then echo "ERROR: AGENT_NAME not set"; exit 1; fi; "${NOLAN_ROOT}/app/scripts/task.sh" current "${AGENT_NAME}" 2>/dev/null || echo "No active task"`

## Complete Task
!`if [ -z "${AGENT_NAME:-}" ]; then echo "ERROR: AGENT_NAME not set"; exit 1; fi; "${NOLAN_ROOT}/app/scripts/task.sh" complete "${AGENT_NAME}"`

## Next Steps

Your task has been marked complete. The coordinator will be notified on their next session start.

If you have work output to hand off:
1. Ensure your output file is updated with all findings
2. Add the `<!-- STATUS:COMPLETE:$(date +%Y-%m-%d) -->` marker if required
3. The coordinator will review and assign the next phase
