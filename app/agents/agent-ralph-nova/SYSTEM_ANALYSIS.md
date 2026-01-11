# System Analysis: Handoff, Task Assignment, Project Tracking & Hooks

**Date:** 2026-01-11
**Analyst:** Ralph-Nova
**Status:** Ready for fixes

---

## Executive Summary

Comprehensive audit of the handoff, task assignment, project tracking, and hooks systems. Found **13 issues** - 4 critical, 3 high priority, 3 medium, 3 low.

---

## CRITICAL ISSUES (P0) - Fix First

### Issue #1: Team Config Path Lookup Doesn't Support Subdirectories

**Affected Files:**
- `/app/scripts/assign.sh` (lines 97, 125, 174, 209, 246)
- `/app/.claude/commands/handoff.md` (line 8)
- `/app/.claude/commands/close-project.md` (lines 8, 14, 17, 20, 47, 55)

**Problem:** Uses direct path `nolan_root / 'teams' / f'{team_name}.yaml'` but team configs are now in subdirectories like `teams/dev_development/nolan.yaml`.

**Current Code (assign.sh line 97):**
```python
config = yaml.safe_load((nolan_root / 'teams' / f'{team_name}.yaml').read_text())
```

**Fix:** Use rglob pattern:
```python
config_path = None
for path in (nolan_root / 'teams').rglob(f'{team_name}.yaml'):
    config_path = path
    break
if config_path is None:
    raise FileNotFoundError(f"Team config not found: {team_name}")
config = yaml.safe_load(config_path.read_text())
```

**Files needing this fix:**
1. `assign.sh` - 5 locations (lines 97, 125, 174, 209, 246)
2. `handoff.md` - line 8 inline Python
3. `close-project.md` - lines 8, 14, 17, 20, 47, 55 inline Python

---

### Issue #2: _lib.sh get_coordinator_file() Doesn't Parse YAML .team Files

**File:** `/app/.claude/hooks/_lib.sh` line 23

**Current Code:**
```bash
team_name=$(cat "$team_file")  # Returns full YAML content!
```

**Problem:** If `.team` is YAML format:
```yaml
team: decision-logging
workflow_files:
  - research.md
```
This returns the entire YAML, not just `decision-logging`.

**Fix:** Replace line 23 with:
```bash
team_name=$(get_team_name "$project_path")
```

But wait - get_team_name is defined later in the file. Need to either:
1. Move get_team_name() before get_coordinator_file(), OR
2. Inline the YAML parsing in get_coordinator_file()

**Recommended Fix - Inline parsing (replace lines 18-24):**
```bash
    # Read team name from .team file (required)
    if [[ ! -f "$team_file" ]]; then
        echo "Error: .team file not found at $team_file" >&2
        return 1
    fi

    # Parse team name (supports YAML and plain text)
    team_name=$(python3 -c "
import yaml
from pathlib import Path

content = Path('$team_file').read_text()
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        print(data['team'])
    else:
        print(content.strip())
except:
    print(content.strip())
" 2>/dev/null || cat "$team_file" | head -1)
```

Same fix needed for get_coordinator_name() at line 72.

---

### Issue #3: validate-agent-ownership.sh Doesn't Parse YAML .team Files

**File:** `/app/.claude/hooks/validate-agent-ownership.sh`

**Problem locations:**
- Line 90: `team_name = team_file.read_text().strip()`
- Line 123: `team_name = team_file.read_text().strip()`

**Fix for lines 89-93:** Replace with:
```python
# Parse team name (supports YAML and plain text formats)
team_content = team_file.read_text()
try:
    data = yaml.safe_load(team_content)
    if isinstance(data, dict) and 'team' in data:
        team_name = data['team']
    else:
        team_name = team_content.strip()
except:
    team_name = team_content.strip()
```

**Additional fix needed at line 93:** Uses direct path without rglob:
```python
config_path = Path(nolan_root) / 'teams' / f'{team_name}.yaml'
```

Should use rglob like lines 128-134 do.

---

### Issue #4: Double Handoff Creation on Agent Stop

**Problem:** Both stop hooks create handoff files:
1. `validate-phase-complete.py` (runs first, 120s timeout) → creates with SHA256 ID
2. `auto-handoff.sh` (runs second, 30s timeout) → creates with `HO_{MSG_ID}` format

**Settings.json config (lines 7-21):**
```json
"Stop": [
  {
    "hooks": [
      { "command": "validate-phase-complete.py", "timeout": 120 },
      { "command": "auto-handoff.sh", "timeout": 30 }
    ]
  }
]
```

**Fix Options:**

**Option A (Recommended):** Make auto-handoff.sh check if handoff already exists:
Add at line 113 (after getting MSG_ID):
```bash
# Check if handoff already exists (created by validate-phase-complete.py)
HANDOFF_DIR="$PROJECTS_DIR/.handoffs/pending"
PROCESSED_DIR="$PROJECTS_DIR/.handoffs/processed"

if find "$HANDOFF_DIR" "$PROCESSED_DIR" -name "*${AGENT}*" -newer "$TASK_FILE" 2>/dev/null | grep -q .; then
    echo "Handoff already exists for $AGENT - skipping"
    exit 0
fi
```

**Option B:** Remove auto-handoff.sh from settings.json entirely and rely on validate-phase-complete.py

**Option C:** Standardize handoff ID format across both scripts

---

## HIGH PRIORITY ISSUES (P1)

### Issue #5: Handoff ID Format Inconsistency

| Source | Format | Example |
|--------|--------|---------|
| validate-phase-complete.py | SHA256 12-char | `a1b2c3d4e5f6` |
| task.sh | MSG_ID transform | `HO_DAN_abc123` |
| auto-handoff.sh | MSG_ID transform | `HO_DAN_abc123` |

**Impact:** Search patterns may not match across scripts.

**Fix:** Standardize on MSG_ID-based format:
In `validate-phase-complete.py` line 246-247, change:
```python
def generate_handoff_id() -> str:
    import hashlib
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')
    return hashlib.sha256(timestamp.encode()).hexdigest()[:12]
```

To use MSG_ID if available, or keep the timestamp-based approach but ensure filename patterns match.

---

### Issue #6: Hardcoded Workflow Agents List

**Affected Files:**
- `/app/scripts/handoff-ack.sh` line 23: `"ana bill carl enzo frank"`
- `/app/.claude/hooks/block-cross-team-config-access.sh` line 41: `"ana bill carl enzo frank"`
- `/app/.claude/hooks/block-sensitive-bash-reads.sh` line 33: `"ana bill carl enzo frank"`
- `/app/.claude/hooks/auto-handoff.sh` line 23: checks for `"dan"`

**Fix:** Query team config for agents with `workflow_participant: true` instead of hardcoding.

Example fix for handoff-ack.sh:
```bash
get_workflow_agents() {
    python3 -c "
import yaml, os
from pathlib import Path

nolan_root = Path(os.environ.get('NOLAN_ROOT', ''))
team_name = os.environ.get('TEAM_NAME', 'default')

for path in (nolan_root / 'teams').rglob(f'{team_name}.yaml'):
    config = yaml.safe_load(path.read_text())
    agents = [a['name'] for a in config['team']['agents']
              if a.get('workflow_participant', False)]
    print(' '.join(agents))
    break
" 2>/dev/null || echo "ana bill carl enzo frank"
}

workflow_agents=$(get_workflow_agents)
```

---

### Issue #7: Hardcoded Coordinator Fallback "dan"

**Affected Files:**
- `validate-phase-complete.py` lines 259, 983
- `session-context.sh` lines 219, 277
- `handoff.md` line 8

**Fix:** Require explicit coordinator, fail loudly:
```python
coordinator = config.get('team', {}).get('workflow', {}).get('coordinator')
if not coordinator:
    raise ValueError(f"No coordinator defined in team config: {team_name}")
```

---

## MEDIUM PRIORITY ISSUES (P2)

### Issue #8: notify_coordinator() Uses Wrong Config Path

**File:** `validate-phase-complete.py` lines 263-268

```python
config_path = Path(nolan_root) / 'teams' / f'{team_name}.yaml'
```

**Fix:** Use rglob like load_team_config() does.

---

### Issue #9: handoff-ack.sh Doesn't Update Task Log

When coordinator uses `handoff-ack ack <id>`:
- ✅ Moves file from pending to processed
- ✅ Updates instruction file with `status: reviewed`
- ❌ Doesn't update Task Log in NOTES.md

**Fix:** Add to ack_handoff() after updating instruction file:
```bash
# Update Task Log in coordinator file
project=$(python3 -c "import yaml; print(yaml.safe_load(open('$instruction_file')).get('project', ''))" 2>/dev/null)
msg_id=$(python3 -c "import yaml; print(yaml.safe_load(open('$instruction_file')).get('msg_id', ''))" 2>/dev/null)

if [[ -n "$project" ]] && [[ -n "$msg_id" ]]; then
    coord_path="$PROJECTS_DIR/$project/NOTES.md"  # Or get from team config
    if [[ -f "$coord_path" ]]; then
        sed -i "s/| \`$msg_id\` |.*| Active |/| \`$msg_id\` |\1| Complete |/" "$coord_path"
    fi
fi
```

---

### Issue #10: State File Paths Inconsistent Team Namespacing

Some code uses:
- Team-namespaced: `.state/{team}/active-{agent}.txt`
- Legacy: `.state/active-{agent}.txt`

`validate-phase-complete.py` checks both but other scripts may not.

**Fix:** Audit all state file access and ensure consistent namespacing.

---

## LOW PRIORITY ISSUES (P3)

### Issue #11: Legacy pending.log Reference
**File:** `session-context.sh` line 22
Can be removed after migration complete.

### Issue #12: block-msg-ids.sh Unusual Permissions
File has `rwx--x--x` (711) instead of `rwxr-xr-x` (755).

### Issue #13: Inconsistent Error Messages
Standardize "BLOCKED: " messages across hooks.

---

## Implementation Order

1. **Fix #2** (_lib.sh YAML parsing) - 5 min
2. **Fix #3** (validate-agent-ownership.sh YAML parsing) - 10 min
3. **Fix #1** (assign.sh, handoff.md, close-project.md rglob) - 20 min
4. **Fix #4** (auto-handoff.sh duplicate check) - 10 min
5. **Fix #8** (notify_coordinator rglob) - 5 min
6. **Fix #5-7** (ID format and hardcoded lists) - 30 min
7. **Fix #9-10** (Task Log and state files) - 15 min

**Total estimated time:** ~1.5 hours

---

## Files to Modify (Summary)

| File | Issues |
|------|--------|
| `/app/.claude/hooks/_lib.sh` | #2 |
| `/app/.claude/hooks/validate-agent-ownership.sh` | #3 |
| `/app/.claude/hooks/validate-phase-complete.py` | #5, #7, #8 |
| `/app/.claude/hooks/auto-handoff.sh` | #4, #6 |
| `/app/.claude/hooks/block-cross-team-config-access.sh` | #6 |
| `/app/.claude/hooks/block-sensitive-bash-reads.sh` | #6 |
| `/app/scripts/assign.sh` | #1 |
| `/app/scripts/handoff-ack.sh` | #6, #9 |
| `/app/.claude/commands/handoff.md` | #1, #7 |
| `/app/.claude/commands/close-project.md` | #1 |
| `/app/.claude/hooks/session-context.sh` | #7, #11 |

---

## Testing Checklist

After fixes, verify:
- [ ] Assignment works for teams in subdirectories (e.g., `teams/dev_development/nolan.yaml`)
- [ ] Projects with YAML .team files work correctly
- [ ] Only one handoff created when agent stops
- [ ] Handoff search patterns find all handoff files
- [ ] New agents/teams work without code changes
- [ ] Coordinator lookup works for non-"dan" coordinators
- [ ] Task Log updates from Active to Complete on ACK
