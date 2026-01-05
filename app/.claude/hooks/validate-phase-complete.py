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

def get_docs_path():
    """Get active project docs path from NOTES.md files."""
    # Check for DOCS_PATH environment variable first
    if os.environ.get('DOCS_PATH'):
        return Path(os.environ['DOCS_PATH'])

    # Use PROJECTS_DIR from environment (set by launch scripts)
    projects_base = None
    if os.environ.get('PROJECTS_DIR'):
        projects_base = Path(os.environ['PROJECTS_DIR'])
    elif os.environ.get('AGENT_DIR'):
        # Fallback: Calculate from AGENT_DIR if PROJECTS_DIR not set
        # AGENT_DIR points to agent dir: /path/to/nolan/app/agents/dan
        # We need: /path/to/nolan/projects
        agent_dir = Path(os.environ['AGENT_DIR'])
        repo_root = agent_dir.parent.parent.parent
        projects_base = repo_root / "projects"

    if not projects_base or not projects_base.exists():
        return None

    # Find most recently modified NOTES.md
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


def trigger_handoff(docs_path, agent, output_file):
    """Automatically trigger handoff by adding marker and sending message."""
    filepath = docs_path / output_file

    try:
        # Add handoff marker
        handoff_marker = f"\n---\n**Handoff:** Automatically sent to dan at {Path(__file__).parent}"
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')
        handoff_marker = f"\n---\n**Handoff:** Sent to dan at {timestamp}"

        with open(filepath, 'a') as f:
            f.write(handoff_marker)

        # Send handoff message via team-aliases
        import subprocess
        nolan_root = os.environ.get('NOLAN_ROOT', '')
        if nolan_root:
            msg = f"HANDOFF: {agent} → dan | Project: {docs_path.name} | Status: COMPLETE"
            cmd = f'source "{nolan_root}/app/scripts/team-aliases.sh" && dan "{msg}"'
            try:
                subprocess.run(['bash', '-c', cmd], timeout=10, capture_output=True)
            except Exception as e:
                # Log but don't fail - handoff marker was added
                pass

        return True
    except Exception as e:
        return False

def check_handoff_done(docs_path, agent):
    """Auto-trigger handoff if work is complete and marker missing."""
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

    # Check for completion markers
    completion_patterns = [
        r'\*\*Status:\*\*.*Complete',
        r'\*\*Status:\*\*.*✓',
        r'Status:.*Complete',
        r'All.*complete'
    ]

    is_complete = any(re.search(p, content, re.IGNORECASE) for p in completion_patterns)

    if not is_complete:
        return None  # Work not complete, allow stop (or other checks will handle)

    # Work is complete - check for handoff marker
    if '**Handoff:**' not in content:
        # Auto-trigger handoff
        if trigger_handoff(docs_path, agent, output_files[agent]):
            return None  # Handoff triggered successfully, allow stop
        else:
            return f"Work complete but handoff automation failed. Please run: /handoff {agent} dan"

    return None  # Handoff marker found

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
