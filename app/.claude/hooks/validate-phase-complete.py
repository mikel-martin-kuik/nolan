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
import yaml
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


def load_team_config(project_path: Path) -> dict:
    """Load team configuration for a project.

    Security: Includes DoS protection (file size limit, depth limit).
    Requires .team file - no fallback.
    """
    team_file = project_path / '.team'
    if not team_file.exists():
        raise FileNotFoundError(f".team file not found in {project_path}")
    team_name = team_file.read_text().strip()

    nolan_root = Path(os.environ['NOLAN_ROOT'])
    config_path = nolan_root / 'teams' / f'{team_name}.yaml'

    # DoS protection: Check file size (1MB max)
    if config_path.stat().st_size > 1_048_576:
        raise ValueError(f"Team config too large: {config_path.stat().st_size} bytes (max 1MB)")

    with open(config_path) as f:
        config = yaml.safe_load(f)

    # DoS protection: Check depth (10 levels max)
    def get_depth(obj, current=0):
        if not isinstance(obj, (dict, list)):
            return current
        if isinstance(obj, dict):
            return max((get_depth(v, current + 1) for v in obj.values()), default=current)
        return max((get_depth(item, current + 1) for item in obj), default=current)

    depth = get_depth(config)
    if depth > 10:
        raise ValueError(f"Team config too deeply nested: {depth} levels (max 10)")

    return config


def get_agent_config(team: dict, agent_name: str) -> dict:
    """Get agent configuration from team config."""
    for agent in team['team']['agents']:
        if agent['name'] == agent_name:
            return agent
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
    # Try team-namespaced state files (default team first, then agent-specific)
    agent = os.environ.get('AGENT_NAME', '').lower()
    if agent:
        # Try default team's state files
        for state_file in [
            projects_base / '.state' / 'default' / f'active-{agent}.txt',
            projects_base / '.state' / f'active-{agent}.txt'  # Legacy fallback
        ]:
            if state_file.exists():
                try:
                    project_name = state_file.read_text().strip()
                    if project_name:
                        project_path = projects_base / project_name
                        if project_path.exists():
                            return project_path
                except Exception:
                    pass

    # 3. Fallback: Find most recently modified project by coordinator file
    for project_dir in projects_base.iterdir():
        if not project_dir.is_dir() or project_dir.name.startswith('.') or project_dir.name.startswith('_'):
            continue
        team_file = project_dir / '.team'
        if not team_file.exists():
            continue
        try:
            team_name = team_file.read_text().strip()
            nolan_root = Path(os.environ['NOLAN_ROOT'])
            config_path = nolan_root / 'teams' / f'{team_name}.yaml'
            config = yaml.safe_load(config_path.read_text())
            coordinator_name = config['team']['workflow']['coordinator']
            coordinator_agent = next((a for a in config['team']['agents'] if a['name'] == coordinator_name), None)
            if coordinator_agent and coordinator_agent.get('output_file'):
                coordinator_path = project_dir / coordinator_agent['output_file']
                if coordinator_path.exists():
                    return project_dir
        except Exception:
            continue

    return None

def check_agent_output(docs_path, agent):
    """Check if agent's output file has required sections.

    Loads requirements from team config (required - no fallback).
    """
    try:
        team = load_team_config(docs_path)
    except Exception as e:
        return None  # Skip projects without valid team config

    agent_config = get_agent_config(team, agent)

    if not agent_config or not agent_config.get('output_file'):
        return None  # Agent doesn't require output file

    output_file = agent_config['output_file']
    filepath = docs_path / output_file

    if not filepath.exists():
        return f"Output file {output_file} not found. Complete your work before stopping."

    content = filepath.read_text()
    required_sections = agent_config.get('required_sections', [])
    missing = [s for s in required_sections if s not in content]

    if missing:
        return f"Missing sections in {output_file}: {', '.join(missing)}"

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
        # Try team-namespaced state file (default team)
        projects_base = get_projects_base()
        if projects_base and agent:
            for state_file in [
                projects_base / '.state' / 'default' / f'active-{agent}.txt',
                projects_base / '.state' / f'active-{agent}.txt'  # Legacy fallback
            ]:
                try:
                    if state_file.exists():
                        state_file.unlink()
                except Exception:
                    pass  # Non-critical, don't fail handoff

        return True
    except Exception as e:
        return False

def check_handoff_done(docs_path, agent):
    """Auto-trigger handoff if output file has required sections and marker missing or stale.

    Loads file requirements from team config (required - no fallback).
    """
    try:
        team = load_team_config(docs_path)
    except Exception as e:
        return None  # Skip projects without valid team config

    agent_config = get_agent_config(team, agent)

    if not agent_config or not agent_config.get('output_file'):
        return None  # Agent doesn't require output file

    filepath = docs_path / agent_config['output_file']

    if not filepath.exists():
        return None  # No file, other check will catch this

    content = filepath.read_text()

    # Check if required sections are present (loaded from team config)
    required_sections = agent_config.get('required_sections', [])
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
        if trigger_handoff(docs_path, agent, agent_config['output_file']):
            return None  # Handoff triggered successfully, allow stop
        else:
            return f"Work complete but handoff automation failed. Please run: /handoff {agent} dan"

    return None  # Handoff marker found and recent

def get_coordinator_file(docs_path):
    """Get coordinator's output file from team config."""
    try:
        team = load_team_config(docs_path)
        coordinator_name = team['team']['workflow']['coordinator']
        coordinator_agent = next((a for a in team['team']['agents'] if a['name'] == coordinator_name), None)
        if coordinator_agent and coordinator_agent.get('output_file'):
            return coordinator_agent['output_file']
    except Exception:
        pass
    return None


def check_notes_status(docs_path):
    """Check coordinator's output file for incomplete markers."""
    coordinator_file = get_coordinator_file(docs_path)
    if not coordinator_file:
        return None  # No valid team config, allow stop

    coordinator_path = docs_path / coordinator_file

    if not coordinator_path.exists():
        return None  # No coordinator file, allow stop

    content = coordinator_path.read_text()

    if 'STATUS: IN_PROGRESS' in content.upper() or 'Status: IN_PROGRESS' in content:
        return f"Work marked as IN_PROGRESS in {coordinator_file}. Update status before stopping."

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
        # Try to infer from current working directory using team config
        cwd = Path.cwd()
        try:
            team = load_team_config(docs_path)
            agent_names = [a['name'].lower() for a in team['team']['agents']]
            for name in agent_names:
                if name in str(cwd).lower():
                    agent = name
                    break
        except Exception:
            # Fallback: approve if we can't determine agent
            pass

    # Agents with multi_instance: true are exempt from workflow validation
    if agent:
        try:
            team = load_team_config(docs_path)
            agent_config = get_agent_config(team, agent)
            if agent_config and agent_config.get('multi_instance', False):
                print(json.dumps({"decision": "approve"}))
                return
        except Exception:
            pass

    # Check agent-specific output
    if agent:
        error = check_agent_output(docs_path, agent)
        if error:
            print(json.dumps({
                "decision": "block",
                "reason": error
            }))
            return

        # Check handoff was done (only for non-coordinator agents)
        # Get coordinator from team config
        coordinator = 'dan'  # fallback
        try:
            team = load_team_config(docs_path)
            coordinator = team['team']['workflow']['coordinator']
        except Exception:
            pass

        if agent != coordinator:
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
