---
description: Initiate agent handoff with validation checklist
argument-hint: <from-agent> <to-agent>
allowed-tools: Read, Bash(cat:*), Bash(grep:*), Bash(python3:*), Bash(handoff-ack:*)
---
# Handoff Management

!`agent="${AGENT_NAME:-}"; if [[ "$agent" == "ralph" ]] || [[ "$agent" =~ ^ralph- ]]; then exit 0; fi; coord=$(python3 -c "
import yaml, os, sys
from pathlib import Path
nolan_data_root = Path(os.environ.get('NOLAN_DATA_ROOT', os.path.expanduser('~/.nolan')))
team_name = os.environ.get('TEAM_NAME') or 'default'
config_path = nolan_data_root / 'teams' / team_name / 'team.yaml'
if not config_path:
    print(f'ERROR: Team config not found: {team_name}', file=sys.stderr)
    sys.exit(1)
c = yaml.safe_load(config_path.read_text())
coord = c.get('team', {}).get('workflow', {}).get('coordinator')
if not coord:
    print(f'ERROR: No coordinator in team config: {team_name}', file=sys.stderr)
    sys.exit(1)
print(coord)
" 2>/dev/null); if [[ -z "$coord" ]]; then echo "ERROR: Could not determine coordinator."; exit 1; fi; if [ "$agent" != "$coord" ]; then echo "ERROR: This command is restricted."; exit 1; fi`

## Pending Handoffs
!`"${NOLAN_ROOT}/scripts/handoff-ack.sh" list 2>/dev/null || echo "No pending handoffs"`

## System Status
!`"${NOLAN_ROOT}/scripts/handoff-ack.sh" status 2>/dev/null || echo "Status unavailable"`

## Actions

**ACK all pending handoffs:**
```bash
handoff-ack.sh ack-all
```

**ACK specific handoff:**
```bash
handoff-ack.sh ack <id>
```

**Recover stuck handoffs:**
```bash
handoff-ack.sh recover
```
