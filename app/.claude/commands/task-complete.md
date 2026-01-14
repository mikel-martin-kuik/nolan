---
description: Mark current task as complete (for workflow agents)
allowed-tools: Bash(task.sh:*), Read
---
# Complete Current Task

## Current Task Status
!`if [ -z "${AGENT_NAME:-}" ]; then echo "ERROR: AGENT_NAME not set"; exit 1; fi; "${NOLAN_ROOT}/scripts/task.sh" current "${AGENT_NAME}" 2>/dev/null || echo "No active task"`

## Complete Task
!`if [ -z "${AGENT_NAME:-}" ]; then echo "ERROR: AGENT_NAME not set"; exit 1; fi; "${NOLAN_ROOT}/scripts/task.sh" complete "${AGENT_NAME}"`

## Next Steps

Your task has been marked complete and your coordinator will be notified.

Ensure your output file is updated with all required sections before stopping.
