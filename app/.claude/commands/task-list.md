---
description: List all tasks (active and completed)
argument-hint: [--agent <name>] [--project <name>] [--all]
allowed-tools: Bash(task.sh:*)
---
# Task List

!`agent="${AGENT_NAME:-}"; if [[ "$agent" == "ralph" ]] || [[ "$agent" =~ ^ralph- ]]; then exit 0; fi; coord=$(python3 -c "import yaml, os; from pathlib import Path; data_root=Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan'))); cp=next((data_root/'teams').rglob(os.environ.get('TEAM_NAME','default')+'.yaml'),None); c=yaml.safe_load(cp.read_text()) if cp else exit(1); print(c['team']['workflow']['coordinator'])" 2>/dev/null || echo "dan"); if [ "$agent" != "$coord" ]; then echo "ERROR: This command is restricted."; exit 1; fi`

## Active Tasks
!`"${NOLAN_ROOT}/app/scripts/task.sh" list 2>/dev/null`

## Usage

**Filter by agent:**
```bash
task.sh list --agent carl
```

**Filter by project:**
```bash
task.sh list --project my-project
```

**Show all (including completed):**
```bash
task.sh list --all
```

**Show task history for a project:**
```bash
task.sh history <project-name>
```

**Show specific task details:**
```bash
task.sh show <MSG_ID>
```
