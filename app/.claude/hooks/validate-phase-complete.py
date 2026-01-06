#!/usr/bin/env python3
"""
Stop hook: Validates phase completion before agent stops.

Exit codes:
  0 - Allow stop (JSON output with decision)
  2 - Block stop (JSON output with reason)

Input (stdin): JSON with session_id, stop_reason, transcript_summary
Output (stdout): JSON with decision and reason
"""
import json
import sys
import os
import re
from pathlib import Path
from datetime import datetime

def get_projects_base():
    """Get PROJECTS_DIR base path."""
    if os.environ.get('PROJECTS_DIR'):
        return Path(os.environ['PROJECTS_DIR'])
    elif os.environ.get('AGENT_DIR'):
        agent_dir = Path(os.environ['AGENT_DIR'])
        repo_root = agent_dir.parent.parent.parent
        return repo_root / "projects"
    elif os.environ.get('NOLAN_ROOT'):
        return Path(os.environ['NOLAN_ROOT']) / "projects"
    return None


def get_docs_path():
    """Get active project docs path with explicit tracking."""
    # 1. Check for DOCS_PATH environment variable first (most explicit)
    if os.environ.get('DOCS_PATH'):
        return Path(os.environ['DOCS_PATH'])

    projects_base = get_projects_base()
    if not projects_base or not projects_base.exists():
        return None

    # 2. Check for active project state file (explicit tracking)
    agent = os.environ.get('AGENT_NAME', '').lower()
    if agent:
        state_file = projects_base / '.state' / f'active-{agent}.txt'
        if state_file.exists():
            try:
                project_name = state_file.read_text().strip()
                if project_name:
                    project_path = projects_base / project_name
                    if project_path.exists():
                        return project_path
            except Exception:
                pass

    # 3. Fallback: Find most recently modified NOTES.md (heuristic)
    notes_files = list(projects_base.glob("*/NOTES.md"))
    if notes_files:
        latest = max(notes_files, key=lambda p: p.stat().st_mtime)
        return latest.parent

    return None

def check_agent_output(docs_path, agent):
    """Check if agent's output file has required sections."""
    requirements = {
        'ana': ('research.md', ['## Problem', '## Findings', '## Recommendations']),
        'bill': ('plan.md', ['## Overview', '## Tasks', '## Risks']),
        'carl': ('progress.md', ['## Status', '## Changes']),
        'enzo': ('qa-review.md', ['## Summary', '## Findings', '## Recommendation'])
    }

    if agent not in requirements:
        return None  # Unknown agent, allow stop

    filename, required_sections = requirements[agent]
    filepath = docs_path / filename

    if not filepath.exists():
        return f"Output file {filename} not found. Complete your work before stopping."

    content = filepath.read_text()
    missing = [s for s in required_sections if s not in content]

    if missing:
        return f"Missing sections in {filename}: {', '.join(missing)}"

    return None  # All checks passed


def write_to_handoff_queue(agent, project_name, status="COMPLETE"):
    """Write handoff to persistent queue file as fallback."""
    projects_dir = get_projects_base()
    if not projects_dir:
        return False

    queue_dir = projects_dir / '.handoffs'
    queue_file = queue_dir / 'pending.log'

    try:
        queue_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        entry = f"{timestamp}|{agent}|{project_name}|{status}\n"

        with open(queue_file, 'a') as f:
            f.write(entry)
        return True
    except Exception:
        return False


def trigger_handoff(docs_path, agent, output_file):
    """Automatically trigger handoff by adding marker and sending message."""
    filepath = docs_path / output_file
    import subprocess

    try:
        # Add handoff marker with structured format
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
        handoff_marker = f"\n---\n**Handoff:** Sent to dan at {timestamp}\n<!-- HANDOFF:{timestamp}:{agent}:COMPLETE -->"

        with open(filepath, 'a') as f:
            f.write(handoff_marker)

        # Send handoff message via team-aliases (with return code check)
        nolan_root = os.environ.get('NOLAN_ROOT', '')
        delivery_success = False

        if nolan_root:
            msg = f"HANDOFF: {agent} → dan | Project: {docs_path.name} | Status: COMPLETE"
            cmd = f'source "{nolan_root}/app/scripts/team-aliases.sh" && dan "{msg}"'
            try:
                result = subprocess.run(['bash', '-c', cmd], timeout=15, capture_output=True)
                delivery_success = (result.returncode == 0)
            except subprocess.TimeoutExpired:
                delivery_success = False
            except Exception:
                delivery_success = False

        # If direct delivery failed, write to persistent queue
        if not delivery_success:
            queue_success = write_to_handoff_queue(agent, docs_path.name)
            if not queue_success:
                # Both failed - this is a problem but marker was added
                return False

        # Clear active project state file on successful handoff
        projects_base = get_projects_base()
        if projects_base and agent:
            state_file = projects_base / '.state' / f'active-{agent}.txt'
            try:
                if state_file.exists():
                    state_file.unlink()
            except Exception:
                pass  # Non-critical, don't fail handoff

        return True
    except Exception as e:
        return False

def check_handoff_done(docs_path, agent):
    """Auto-trigger handoff if output file has required sections and marker missing or stale."""
    output_files = {
        'ana': 'research.md',
        'bill': 'plan.md',
        'carl': 'progress.md',
        'enzo': 'qa-review.md'
    }

    if agent not in output_files:
        return None  # Unknown agent, allow stop

    filepath = docs_path / output_files[agent]

    if not filepath.exists():
        return None  # No file, other check will catch this

    content = filepath.read_text()

    # Check if required sections are present (same as check_agent_output)
    # If sections are there, work is complete - no need for magic status words
    requirements = {
        'ana': ['## Problem', '## Findings', '## Recommendations'],
        'bill': ['## Overview', '## Tasks', '## Risks'],
        'carl': ['## Status', '## Changes'],
        'enzo': ['## Summary', '## Findings', '## Recommendation']
    }

    required_sections = requirements.get(agent, [])
    missing = [s for s in required_sections if s not in content]

    if missing:
        return None  # Required sections missing, other check handles this

    # Required sections present - check for automated handoff marker
    # Parse timestamp from most recent marker to detect stale handoffs
    needs_handoff = False
    marker_pattern = r'<!-- HANDOFF:(\d{4}-\d{2}-\d{2} \d{2}:\d{2}):'
    matches = re.findall(marker_pattern, content)

    if not matches:
        # No automated marker found at all
        needs_handoff = True
    else:
        # Parse most recent marker timestamp
        latest_marker_time = matches[-1]  # Get last match (most recent)
        try:
            marker_dt = datetime.strptime(latest_marker_time, '%Y-%m-%d %H:%M')
            current_dt = datetime.now()
            minutes_elapsed = (current_dt - marker_dt).total_seconds() / 60

            # If more than 5 minutes since last handoff, trigger new one
            if minutes_elapsed > 5:
                needs_handoff = True
        except ValueError:
            # Couldn't parse timestamp, treat as missing
            needs_handoff = True

    if needs_handoff:
        # Auto-trigger handoff
        if trigger_handoff(docs_path, agent, output_files[agent]):
            return None  # Handoff triggered successfully, allow stop
        else:
            return f"Work complete but handoff automation failed. Please run: /handoff {agent} dan"

    return None  # Handoff marker found and recent

def check_notes_status(docs_path):
    """Check NOTES.md for incomplete markers."""
    notes_path = docs_path / "NOTES.md"

    if not notes_path.exists():
        return None  # No NOTES.md, allow stop

    content = notes_path.read_text()

    if 'STATUS: IN_PROGRESS' in content.upper() or 'Status: IN_PROGRESS' in content:
        return "Work marked as IN_PROGRESS in NOTES.md. Update status before stopping."

    return None

def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        # No input or invalid JSON, allow stop
        print(json.dumps({"decision": "approve"}))
        return

    docs_path = get_docs_path()

    if not docs_path:
        # No active project found, allow stop
        print(json.dumps({"decision": "approve"}))
        return

    # Determine agent from environment or directory
    agent = os.environ.get('AGENT_NAME', '').lower()

    if not agent:
        # Try to infer from current working directory
        cwd = Path.cwd()
        if 'ana' in str(cwd).lower():
            agent = 'ana'
        elif 'bill' in str(cwd).lower():
            agent = 'bill'
        elif 'carl' in str(cwd).lower():
            agent = 'carl'
        elif 'enzo' in str(cwd).lower():
            agent = 'enzo'
        elif 'ralph' in str(cwd).lower():
            agent = 'ralph'

    # Ralph is exempt from all validation - utility agent without workflow requirements
    if agent == 'ralph':
        print(json.dumps({"decision": "approve"}))
        return

    # Check agent-specific output
    if agent:
        error = check_agent_output(docs_path, agent)
        if error:
            print(json.dumps({
                "decision": "block",
                "reason": error
            }))
            return

        # Check handoff was done (only for non-dan agents)
        if agent != 'dan':
            error = check_handoff_done(docs_path, agent)
            if error:
                print(json.dumps({
                    "decision": "block",
                    "reason": error
                }))
                return

    # Check NOTES.md status
    error = check_notes_status(docs_path)
    if error:
        print(json.dumps({
            "decision": "block",
            "reason": error
        }))
        return

    # All checks passed
    print(json.dumps({"decision": "approve"}))

if __name__ == "__main__":
    main()
