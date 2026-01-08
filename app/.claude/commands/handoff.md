---
description: Initiate agent handoff with validation checklist
argument-hint: <from-agent> <to-agent>
allowed-tools: Read, Bash(cat:*), Bash(grep:*), Bash(python3:*), Bash(handoff-ack:*), Bash(coordinator-heartbeat:*)
---
# Handoff Management

!`agent="${AGENT_NAME:-}"; if [[ "$agent" == "ralph" ]] || [[ "$agent" =~ ^ralph- ]]; then exit 0; fi; coord=$(python3 -c "import yaml, os; c=yaml.safe_load(open(os.environ['NOLAN_ROOT']+'/teams/'+os.environ.get('TEAM_NAME','default')+'.yaml')); print(c['team']['workflow']['coordinator'])" 2>/dev/null || echo "dan"); if [ "$agent" != "$coord" ]; then echo "ERROR: This command is restricted."; exit 1; fi`

## Pending Handoffs
!`"${NOLAN_ROOT}/app/scripts/handoff-ack.sh" list 2>/dev/null || echo "No pending handoffs"`

## System Status
!`"${NOLAN_ROOT}/app/scripts/handoff-ack.sh" status 2>/dev/null || echo "Status unavailable"`

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
