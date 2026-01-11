#!/usr/bin/env python3
"""
Stop hook: Validates phase completion before agent stops.

Exit codes:
  0 - Allow stop (JSON output with decision)
  2 - Block stop (JSON output with reason)

Input (stdin): JSON with session_id, stop_reason, transcript_summary
Output (stdout): JSON with decision and reason

FIXES APPLIED:
- Atomic handoff writes (queue file before marker)
- Deterministic project selection (fail loudly if ambiguous)
- File locking for state file access
- Configurable timeouts from team config
- Loud failures on missing config
- Fix silent rename failures in auto_ack
- Fix false positive on missing coordinator file
"""
import json
import sys
import os
import re
import yaml
import fcntl
import tempfile
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple

# ============================================================================
# AUTO-PROGRESSION FUNCTIONS (Schema v2)
# ============================================================================

def detect_rejection_marker(filepath: Path) -> Optional[str]:
    """Check output file for rejection marker.

    Format: <!-- REJECTED: reason text here -->
    Returns reason if found, None if approved.
    """
    try:
        content = filepath.read_text()
        match = re.search(r'<!--\s*REJECTED:\s*(.+?)\s*-->', content, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    except Exception:
        pass
    return None


def call_workflow_router(project_path: Path, phase: str, decision: str = "approved") -> dict:
    """Call workflow-router.py and return parsed result."""
    import subprocess
    router_path = Path(__file__).parent.parent.parent / "scripts" / "workflow-router.py"

    try:
        result = subprocess.run(
            ["python3", str(router_path), str(project_path), phase, decision],
            capture_output=True, text=True, timeout=10
        )

        if result.returncode != 0:
            return {"action": "escalate", "reason": f"Router error: {result.stderr}"}

        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        return {"action": "escalate", "reason": "Router timed out"}
    except json.JSONDecodeError as e:
        return {"action": "escalate", "reason": f"Router returned invalid JSON: {e}"}
    except Exception as e:
        return {"action": "escalate", "reason": f"Router failed: {e}"}


def call_assign(project_name: str, phase: str, task: str) -> bool:
    """Call assign.sh to assign next phase."""
    import subprocess
    assign_path = Path(__file__).parent.parent.parent / "scripts" / "assign.sh"

    try:
        result = subprocess.run(
            [str(assign_path), project_name, phase, task],
            capture_output=True, text=True, timeout=30
        )
        return result.returncode == 0
    except Exception as e:
        log_stderr(f"assign.sh failed: {e}")
        return False


def write_status_file(project_path: Path, output_file: str, decision: str, reason: str = ""):
    """Create .status file for audit trail."""
    try:
        status_path = project_path / f"{output_file}.status"
        timestamp = datetime.now().isoformat()

        data = {
            "status": decision.upper(),
            "reason": reason,
            "timestamp": timestamp
        }

        with open(status_path, 'w') as f:
            yaml.dump(data, f, default_flow_style=False)
    except Exception as e:
        log_stderr(f"Failed to write status file: {e}")


def send_desktop_notification(title: str, message: str):
    """Send desktop notification (Linux notify-send)."""
    import subprocess
    try:
        subprocess.run(
            ["notify-send", title, message],
            capture_output=True, timeout=5
        )
    except Exception as e:
        log_stderr(f"Failed to send notification: {e}")


def write_incident_log(project_path: Path, event_type: str, details: str):
    """Append to incident log."""
    state_base = get_state_base()
    if not state_base:
        return

    try:
        log_path = state_base / "incidents.log"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with open(log_path, 'a') as f:
            f.write(f"[{timestamp}] {event_type} | {project_path.name} | {details}\n")
    except Exception as e:
        log_stderr(f"Failed to write incident log: {e}")


def get_current_phase_for_agent(team_config: dict, agent: str) -> Optional[str]:
    """Get the current phase name for an agent from team config."""
    phases = team_config.get('team', {}).get('workflow', {}).get('phases', [])
    for phase in phases:
        if phase.get('owner') == agent:
            return phase.get('name')
    return None


def handle_auto_progression(docs_path: Path, agent: str, team_config: dict) -> bool:
    """Handle auto-progression for schema v2 teams.

    Returns True if auto-progression was handled, False if legacy behavior should be used.
    """
    schema_version = team_config.get('team', {}).get('schema_version', 1)
    if schema_version < 2:
        return False  # Use legacy behavior

    agent_config = get_agent_config(team_config, agent)
    if not agent_config:
        return False

    output_file = agent_config.get('output_file', '')
    if not output_file:
        return False

    output_path = docs_path / output_file

    # Detect rejection marker
    rejection_reason = detect_rejection_marker(output_path) if output_path.exists() else None
    decision = "rejected" if rejection_reason else "approved"

    # Write status file for audit
    write_status_file(docs_path, output_file, decision, rejection_reason or "Auto-approved")

    # Get current phase name from agent config
    current_phase = get_current_phase_for_agent(team_config, agent)
    if not current_phase:
        log_stderr(f"Could not determine current phase for agent {agent}")
        return False

    route_result = call_workflow_router(docs_path, current_phase, decision)
    action = route_result.get('action')

    if action == 'assign':
        next_phase = route_result.get('next_phase')
        next_agent = route_result.get('next_agent')
        task = f"Continue {docs_path.name} - {next_phase}"

        success = call_assign(docs_path.name, next_phase, task)
        if success:
            log_stderr(f"Auto-assigned {next_phase} to {next_agent}")
        else:
            send_desktop_notification(
                "Nolan: Assignment Failed",
                f"Failed to assign {next_phase} for {docs_path.name}"
            )
            write_incident_log(docs_path, "ASSIGN_FAILED", f"{next_phase} to {next_agent}")

    elif action == 'complete':
        send_desktop_notification(
            "Nolan: Project Complete",
            f"{docs_path.name} has completed all phases"
        )
        log_stderr(f"Project {docs_path.name} complete")

    elif action == 'escalate':
        reason = route_result.get('reason', 'Unknown error')
        send_desktop_notification(
            "Nolan: Escalation Required",
            f"{docs_path.name}: {reason}"
        )
        write_incident_log(docs_path, "ESCALATION", reason)

    return True


# ============================================================================
# END AUTO-PROGRESSION FUNCTIONS
# ============================================================================

# Default timeout values (can be overridden in team config)
DEFAULT_ACK_TIMEOUT_SECONDS = 60
DEFAULT_ACK_POLL_INTERVAL = 6
DEFAULT_COORDINATOR_WAIT_MINUTES = 60


def log_stderr(msg: str):
    """Write message to stderr for debugging."""
    sys.stderr.write(f"[validate-phase-complete] {msg}\n")
    sys.stderr.flush()


def check_force_stop() -> bool:
    """Check emergency override flag."""
    return os.environ.get('NOLAN_FORCE_STOP', '').lower() in ('1', 'true', 'yes')


def get_projects_base() -> Optional[Path]:
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


def get_state_base() -> Optional[Path]:
    """Get state directory base path (.state at NOLAN_ROOT level)."""
    if os.environ.get('NOLAN_ROOT'):
        return Path(os.environ['NOLAN_ROOT']) / ".state"
    elif os.environ.get('AGENT_DIR'):
        agent_dir = Path(os.environ['AGENT_DIR'])
        repo_root = agent_dir.parent.parent.parent
        return repo_root / ".state"
    return None


def acquire_lock(lockfile: Path, timeout: int = 5) -> Optional[int]:
    """Acquire file lock with timeout.

    Returns file descriptor on success, None on failure.
    """
    import time
    lockfile.parent.mkdir(parents=True, exist_ok=True)

    try:
        fd = os.open(str(lockfile), os.O_CREAT | os.O_RDWR)
        start = time.time()
        while time.time() - start < timeout:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return fd
            except BlockingIOError:
                time.sleep(0.1)
        os.close(fd)
        return None
    except Exception as e:
        log_stderr(f"Lock acquisition failed: {e}")
        return None


def release_lock(fd: int):
    """Release file lock."""
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
    except Exception:
        pass


def parse_team_name(team_file: Path) -> str:
    """Parse team name from .team file (supports YAML and plain text formats)."""
    content = team_file.read_text()
    try:
        data = yaml.safe_load(content)
        if isinstance(data, dict) and 'team' in data:
            return data['team']
        else:
            return content.strip()
    except:
        return content.strip()


def load_team_config(project_path: Path) -> dict:
    """Load team configuration for a project.

    Security: Includes DoS protection (file size limit, depth limit).
    Requires .team file - raises exception if not found.
    """
    team_file = project_path / '.team'
    if not team_file.exists():
        raise FileNotFoundError(f".team file not found in {project_path}")
    team_name = parse_team_name(team_file)

    nolan_root = os.environ.get('NOLAN_ROOT')
    if not nolan_root:
        raise EnvironmentError("NOLAN_ROOT environment variable not set")

    # Search for team config in teams directory (supports subdirectories)
    teams_dir = Path(nolan_root) / 'teams'
    config_path = None
    for path in teams_dir.rglob(f'{team_name}.yaml'):
        config_path = path
        break

    if config_path is None:
        raise FileNotFoundError(f"Team config not found: {team_name}")

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


def get_timeout_config(team_config: dict) -> dict:
    """Extract timeout configuration from team config with defaults."""
    workflow = team_config.get('team', {}).get('workflow', {})
    timeouts = workflow.get('timeouts', {})

    return {
        'ack_timeout_seconds': timeouts.get('ack_timeout_seconds', DEFAULT_ACK_TIMEOUT_SECONDS),
        'ack_poll_interval': timeouts.get('ack_poll_interval', DEFAULT_ACK_POLL_INTERVAL),
        'coordinator_wait_minutes': timeouts.get('coordinator_wait_minutes', DEFAULT_COORDINATOR_WAIT_MINUTES),
    }


def get_agent_config(team: dict, agent_name: str) -> Optional[dict]:
    """Get agent configuration from team config."""
    for agent in team['team']['agents']:
        if agent['name'] == agent_name:
            return agent
    return None


def get_docs_path_strict() -> Tuple[Optional[Path], Optional[str]]:
    """Get active project docs path with STRICT validation.

    Returns (path, error_message). If path is None, error_message explains why.
    This version fails loudly instead of silently returning None.
    """
    # 1. Check for DOCS_PATH environment variable first (most explicit)
    if os.environ.get('DOCS_PATH'):
        docs_path = Path(os.environ['DOCS_PATH'])
        if docs_path.exists():
            return docs_path, None
        return None, f"DOCS_PATH set to '{docs_path}' but directory does not exist"

    projects_base = get_projects_base()
    if not projects_base:
        return None, "Cannot determine projects directory (set PROJECTS_DIR, AGENT_DIR, or NOLAN_ROOT)"

    if not projects_base.exists():
        return None, f"Projects directory does not exist: {projects_base}"

    # 2. Check for active project state file (explicit tracking)
    agent = os.environ.get('AGENT_NAME', '').lower()
    team_name = os.environ.get('TEAM_NAME', 'default')

    state_base = get_state_base()
    if not state_base:
        return None, "Cannot determine state directory (set NOLAN_ROOT)"

    if agent:
        # Try team-namespaced state file first
        state_file = state_base / team_name / f'active-{agent}.txt'
        if state_file.exists():
            try:
                # Use file locking for state file access
                lock_file = state_file.parent / f'.lock-{agent}'
                fd = acquire_lock(lock_file, timeout=2)
                try:
                    project_name = state_file.read_text().strip()
                finally:
                    if fd:
                        release_lock(fd)

                if project_name:
                    project_path = projects_base / project_name
                    if project_path.exists():
                        return project_path, None
                    return None, f"Active project '{project_name}' from state file does not exist"
            except Exception as e:
                return None, f"Failed to read state file: {e}"

        # Legacy fallback (warn but continue)
        legacy_state = state_base / f'active-{agent}.txt'
        if legacy_state.exists():
            log_stderr(f"WARNING: Using legacy state file {legacy_state}. Migrate to team-namespaced state.")
            try:
                project_name = legacy_state.read_text().strip()
                if project_name:
                    project_path = projects_base / project_name
                    if project_path.exists():
                        return project_path, None
            except Exception:
                pass

    # 3. NO FALLBACK - require explicit project binding
    # This prevents non-deterministic "most recently modified" selection
    return None, (
        f"No active project found for agent '{agent}' in team '{team_name}'. "
        f"Set DOCS_PATH or create state file at: {state_base}/{team_name}/active-{agent}.txt"
    )


def generate_handoff_id(agent: str = "") -> str:
    """Generate traceable handoff ID.

    Format: HO_{YYYYMMDD}_{HHMMSS}_{AGENT}_{SHORT_HASH}
    Example: HO_20260111_143022_bill_a1b2c3

    This format is:
    - Traceable: includes timestamp and agent name
    - Recognizable: HO prefix, human-readable date
    - Unique: short hash prevents collisions
    """
    import hashlib
    now = datetime.now()
    date_part = now.strftime('%Y%m%d')
    time_part = now.strftime('%H%M%S')
    # Include microseconds in hash for uniqueness
    hash_input = f"{now.strftime('%Y%m%d%H%M%S%f')}{agent}"
    short_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:6]
    agent_part = agent.lower() if agent else "unknown"
    return f"HO_{date_part}_{time_part}_{agent_part}_{short_hash}"


def get_next_agent_from_phases(team_config: dict, current_agent: str) -> Optional[str]:
    """Get the next agent in the workflow based on phases.

    Uses workflow.phases[].next to determine agent-to-agent handoff target.
    Returns None if workflow is complete or agent not in phases.
    """
    phases = team_config.get('team', {}).get('workflow', {}).get('phases', [])

    # Find current agent's phase
    for phase in phases:
        if phase.get('owner') == current_agent:
            next_phase_name = phase.get('next')
            if not next_phase_name:
                return None  # Workflow complete
            # Find owner of next phase
            for next_phase in phases:
                if next_phase.get('name') == next_phase_name:
                    return next_phase.get('owner')
            break
    return None


def get_note_taker(team_config: dict) -> Optional[str]:
    """Get the note_taker (or coordinator for legacy) from team config."""
    workflow = team_config.get('team', {}).get('workflow', {})
    return workflow.get('note_taker') or workflow.get('coordinator')


def notify_next_agent(agent: str, project_name: str, handoff_id: str,
                      next_agent: str, team_name: str = "default"):
    """Send wake-up notification to next agent via tmux.

    This wakes the next agent from sleep state so they can pick up the handoff.
    Uses the team-aliases.sh messaging system.
    """
    import subprocess

    if not next_agent:
        log_stderr("Cannot notify next agent: no next agent specified")
        return False

    nolan_root = os.environ.get('NOLAN_ROOT')
    if not nolan_root:
        log_stderr("Cannot notify next agent: NOLAN_ROOT not set")
        return False

    # Build session name for next agent
    session_name = f"agent-{team_name}-{next_agent}"

    # Check if agent session exists
    try:
        result = subprocess.run(
            ['tmux', 'has-session', '-t', session_name],
            capture_output=True, timeout=2
        )
        if result.returncode != 0:
            log_stderr(f"Agent session '{session_name}' not found - cannot send wake notification")
            return False
    except Exception as e:
        log_stderr(f"Failed to check agent session: {e}")
        return False

    # Build wake-up message
    msg_id = f"HANDOFF_{handoff_id[:8]}"
    message = f"{msg_id}: Handoff from {agent} - project '{project_name}' ready for {next_agent}"

    try:
        # Exit copy mode if active (prevents message from being ignored)
        subprocess.run(
            ['tmux', 'send-keys', '-t', session_name, 'q'],
            capture_output=True, timeout=1
        )

        # Small delay
        import time
        time.sleep(0.05)

        # Send the wake-up message
        subprocess.run(
            ['tmux', 'send-keys', '-t', session_name, '-l', message],
            capture_output=True, timeout=2
        )
        subprocess.run(
            ['tmux', 'send-keys', '-t', session_name, 'C-m'],
            capture_output=True, timeout=1
        )

        log_stderr(f"Sent wake notification to {next_agent}: {msg_id}")
        return True

    except subprocess.TimeoutExpired:
        log_stderr(f"Timeout sending wake notification to {next_agent}")
        return False
    except Exception as e:
        log_stderr(f"Failed to send wake notification: {e}")
        return False


# Legacy alias for backwards compatibility
def notify_coordinator(agent: str, project_name: str, handoff_id: str, team_name: str = "default"):
    """Legacy wrapper - now uses agent-to-agent notification."""
    # Try to determine next agent from team config
    nolan_root = os.environ.get('NOLAN_ROOT')
    if not nolan_root:
        return False

    teams_dir = Path(nolan_root) / 'teams'
    config_path = None
    for path in teams_dir.rglob(f'{team_name}.yaml'):
        config_path = path
        break

    if not config_path:
        return False

    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
        # For legacy, notify the note_taker instead
        next_agent = get_note_taker(config)
        if next_agent:
            return notify_next_agent(agent, project_name, handoff_id, next_agent, team_name)
    except Exception:
        pass
    return False


def write_handoff_file_atomic(agent: str, project_name: str, project_path: Path,
                               handoff_id: str, status: str = "COMPLETE") -> bool:
    """Write handoff file atomically using temp file + rename.

    Returns True on success, False on failure.
    This ensures the handoff file is either fully written or not at all.
    Uses agent-to-agent handoff pattern based on workflow phases.
    """
    state_base = get_state_base()
    if not state_base:
        log_stderr("Cannot write handoff: state directory not found")
        return False

    pending_dir = state_base / 'handoffs' / 'pending'
    lock_file = state_base / 'handoffs' / '.lock-pending'

    try:
        pending_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        timestamp_file = datetime.now().strftime('%Y%m%d_%H%M%S')

        filename = f"{timestamp_file}_{agent}_{handoff_id}.handoff"
        final_path = pending_dir / filename

        # Get team info and determine next agent from workflow phases
        team_name = "unknown"
        next_agent = None
        try:
            team_file = project_path / '.team'
            if team_file.exists():
                team_name = parse_team_name(team_file)
                # Get next agent from workflow phases (agent-to-agent pattern)
                team_config = load_team_config(project_path)
                next_agent = get_next_agent_from_phases(team_config, agent)
                # If no next agent in workflow (complete), notify note_taker
                if not next_agent:
                    next_agent = get_note_taker(team_config)
        except Exception as e:
            log_stderr(f"Failed to determine next agent for handoff: {e}")

        if not next_agent:
            log_stderr(f"No next agent found for {agent} in team {team_name} - handoff may not be processed")
            next_agent = "unknown"

        # Build handoff data
        handoff_data = {
            'id': handoff_id,
            'timestamp': timestamp,
            'from_agent': agent,
            'to_agent': next_agent,
            'project': project_name,
            'team': team_name,
            'status': status,
            'acknowledged': False
        }

        # Atomic write: temp file + rename (with locking)
        fd = acquire_lock(lock_file, timeout=5)
        if not fd:
            log_stderr("Failed to acquire lock for handoff write")
            return False

        try:
            # Write to temp file first
            with tempfile.NamedTemporaryFile(mode='w', dir=pending_dir,
                                             suffix='.tmp', delete=False) as tmp:
                yaml.dump(handoff_data, tmp, default_flow_style=False)
                tmp_path = tmp.name

            # Atomic rename
            shutil.move(tmp_path, final_path)
            return True
        finally:
            release_lock(fd)

    except Exception as e:
        log_stderr(f"Failed to write handoff file: {e}")
        return False


def wait_for_ack(handoff_id: str, timeout_seconds: int = DEFAULT_ACK_TIMEOUT_SECONDS,
                 poll_interval: int = DEFAULT_ACK_POLL_INTERVAL) -> bool:
    """Wait for coordinator to ACK the handoff.

    Checks if handoff file was moved from pending/ to processed/.
    Returns True if ACK'd, False if timeout.
    """
    import time

    state_base = get_state_base()
    if not state_base:
        return False

    pending_dir = state_base / 'handoffs' / 'pending'
    processed_dir = state_base / 'handoffs' / 'processed'

    max_attempts = max(1, timeout_seconds // poll_interval)

    for attempt in range(max_attempts):
        # Check if file was moved to processed (ACK'd)
        pending_files = list(pending_dir.glob(f'*{handoff_id}*.handoff')) if pending_dir.exists() else []
        processed_files = list(processed_dir.glob(f'*{handoff_id}*.handoff')) if processed_dir.exists() else []

        if processed_files and not pending_files:
            # File moved to processed - ACK received
            return True

        if not pending_files and not processed_files:
            # File gone from both - unusual but treat as ACK'd
            log_stderr(f"Handoff {handoff_id} not found in pending or processed - treating as ACK'd")
            return True

        # Still pending - wait and retry
        if attempt < max_attempts - 1:
            time.sleep(poll_interval)

    log_stderr(f"Handoff {handoff_id} ACK timeout after {timeout_seconds}s")
    return False


def auto_ack_pending_handoffs() -> Tuple[int, int]:
    """Automatically ACK all pending handoffs (for coordinator).

    Moves all .handoff files from pending/ to processed/.
    Returns (success_count, failure_count).
    """
    state_base = get_state_base()
    if not state_base:
        return 0, 0

    pending_dir = state_base / 'handoffs' / 'pending'
    processed_dir = state_base / 'handoffs' / 'processed'
    lock_file = state_base / 'handoffs' / '.lock-pending'

    if not pending_dir.exists():
        return 0, 0

    processed_dir.mkdir(parents=True, exist_ok=True)

    # Acquire lock for batch operation
    fd = acquire_lock(lock_file, timeout=10)
    if not fd:
        log_stderr("Failed to acquire lock for auto-ACK")
        return 0, 0

    success_count = 0
    failure_count = 0

    try:
        for handoff_file in pending_dir.glob('*.handoff'):
            try:
                dest = processed_dir / handoff_file.name
                shutil.move(str(handoff_file), str(dest))
                success_count += 1
            except Exception as e:
                log_stderr(f"Failed to ACK handoff {handoff_file.name}: {e}")
                failure_count += 1
    finally:
        release_lock(fd)

    return success_count, failure_count


def coordinator_stop_check(docs_path: Path) -> Optional[str]:
    """Coordinator stop check - ACK pending handoffs.

    Coordinator can always stop after ACKing handoffs. Project status is
    determined by the backend via file inspection (required headers),
    not by markers.

    Returns None to allow stop, or error string to block.
    """
    # Auto-ACK any pending handoffs (unblocks agents immediately)
    success_count, failure_count = auto_ack_pending_handoffs()
    if success_count > 0:
        log_stderr(f"Auto-ACK'd {success_count} handoff(s)")
    if failure_count > 0:
        log_stderr(f"WARNING: Failed to ACK {failure_count} handoff(s)")

    # Coordinator can always stop - status tracked by backend via file inspection
    return None


def trigger_handoff_atomic(docs_path: Path, agent: str, output_file: str,
                           timeout_config: dict) -> Tuple[Optional[str], Optional[str]]:
    """Trigger handoff ATOMICALLY - queue file FIRST, then marker.

    Returns (handoff_id, error_message).
    If handoff_id is None, error_message explains the failure.

    FIX: Previously wrote marker first, then queue file. If queue write failed,
    marker existed but no handoff file - causing false positive on next check.
    """
    filepath = docs_path / output_file

    try:
        # Generate handoff ID for tracking (includes agent name for traceability)
        handoff_id = generate_handoff_id(agent)
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')

        # Get team name for state management
        team_name = "default"
        try:
            team_file = docs_path / '.team'
            if team_file.exists():
                team_name = parse_team_name(team_file)
        except Exception:
            pass

        # STEP 1: Write queue file FIRST (atomic)
        # FIX: This was step 2 before, causing race condition
        if not write_handoff_file_atomic(agent, docs_path.name, docs_path, handoff_id, "COMPLETE"):
            return None, "Failed to write handoff queue file. Check disk space and permissions."

        # NOTE: We deliberately do NOT write markers to agent output files.
        # Agents see markers in predecessor files and copy them manually, which
        # bypasses the atomic handoff system. The .handoffs/ directory is the
        # single source of truth for handoff state.

        # STEP 2: Send wake-up notification to next agent
        # This wakes the next agent from sleep state so they can pick up the handoff
        try:
            team_config = load_team_config(docs_path)
            next_agent = get_next_agent_from_phases(team_config, agent)
            # If workflow complete, notify note_taker
            if not next_agent:
                next_agent = get_note_taker(team_config)
            if next_agent:
                notify_next_agent(agent, docs_path.name, handoff_id, next_agent, team_name)
        except Exception as e:
            log_stderr(f"Could not notify next agent: {e}")

        # NOTE: State file clearing moved to check_handoff_done() after ACK confirmed
        # This prevents state loss if ACK times out

        return handoff_id, None

    except Exception as e:
        return None, f"Handoff failed: {e}"


def _clear_agent_state_file(docs_path: Path, agent: str):
    """Clear active project state file after successful handoff."""
    state_base = get_state_base()
    if not state_base or not agent:
        return

    # Get team name for namespaced state file
    team_name = "default"
    try:
        team_file = docs_path / '.team'
        if team_file.exists():
            team_name = parse_team_name(team_file)
    except Exception:
        pass

    for state_file in [
        state_base / team_name / f'active-{agent}.txt',
        state_base / f'active-{agent}.txt'  # Legacy fallback
    ]:
        try:
            if state_file.exists():
                state_file.unlink()
                log_stderr(f"Cleared state file: {state_file}")
        except Exception as e:
            log_stderr(f"Warning: Failed to clear state file {state_file}: {e}")


def check_handoff_done(docs_path: Path, agent: str, timeout_config: dict) -> Optional[str]:
    """Auto-trigger handoff and wait for coordinator ACK before allowing stop.

    Synchronous handoff protocol:
    1. If no marker: trigger handoff (write queue file + marker)
    2. Wait for coordinator to ACK (file moved to processed/)
    3. Block stop until ACK received or timeout

    Returns None to allow stop, or error string to block.
    """
    try:
        team = load_team_config(docs_path)
    except FileNotFoundError as e:
        # FIX: Fail loudly instead of silently skipping
        return f"Cannot validate handoff: {e}"
    except Exception as e:
        return f"Team config error: {e}"

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

    # Required sections present - check .handoffs/ directory for existing handoff
    # NOTE: We do NOT check for markers in output files. The .handoffs/ directory
    # is the single source of truth. This prevents agents from copying markers
    # they see in predecessor files.

    ack_timeout = timeout_config.get('ack_timeout_seconds', DEFAULT_ACK_TIMEOUT_SECONDS)
    poll_interval = timeout_config.get('ack_poll_interval', DEFAULT_ACK_POLL_INTERVAL)

    state_base = get_state_base()
    project_name = docs_path.name

    if state_base:
        processed_dir = state_base / 'handoffs' / 'processed'
        pending_dir = state_base / 'handoffs' / 'pending'

        # Check for existing handoff for this agent+project (in pending or processed)
        # Handoff files are named: YYYYMMDD_HHMMSS_<agent>_<id>.handoff
        agent_pattern = f'*_{agent}_*.handoff'

        processed_files = sorted(processed_dir.glob(agent_pattern), reverse=True) if processed_dir.exists() else []
        pending_files = sorted(pending_dir.glob(agent_pattern), reverse=True) if pending_dir.exists() else []

        # Get current assignment timestamp from NOTES.md
        # Format: **Assigned**: 2026-01-10 15:30 (MSG_xxx)
        assignment_timestamp = None
        notes_path = docs_path / 'NOTES.md'
        if notes_path.exists():
            try:
                notes_content = notes_path.read_text()
                # Look for assignment timestamp (with or without time)
                import re
                # Try full timestamp first (YYYY-MM-DD HH:MM)
                match = re.search(r'\*\*Assigned\*\*:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})', notes_content)
                if match:
                    assignment_timestamp = match.group(1).strip()
                else:
                    # Fallback to date only (legacy format)
                    match = re.search(r'\*\*Assigned\*\*:\s*(\d{4}-\d{2}-\d{2})', notes_content)
                    if match:
                        assignment_timestamp = match.group(1) + ' 00:00'
            except Exception:
                pass

        def normalize_timestamp(ts: str) -> str:
            """Convert timestamp to comparable format YYYY-MM-DD HH:MM"""
            if not ts:
                return ''
            # Handle ISO format: 2026-01-10T12:50:33
            if 'T' in ts:
                ts = ts.replace('T', ' ')
            # Take first 16 chars: YYYY-MM-DD HH:MM
            return ts[:16].strip()

        # Check processed files for this project
        for hf in processed_files:
            try:
                import yaml
                data = yaml.safe_load(hf.read_text())
                if data.get('project') == project_name:
                    # Check if handoff is NEWER than current assignment
                    handoff_ts = normalize_timestamp(data.get('timestamp', ''))
                    assignment_ts = normalize_timestamp(assignment_timestamp or '')

                    # If we have BOTH timestamps, compare them
                    if handoff_ts and assignment_ts:
                        if handoff_ts < assignment_ts:
                            # Handoff is OLDER than assignment - don't count it
                            log_stderr(f"Ignoring stale handoff (handoff: {handoff_ts}, assignment: {assignment_ts})")
                            continue
                        # Valid handoff for this project - allow stop
                        return None
                    elif handoff_ts and not assignment_ts:
                        # No assignment timestamp means NOTES.md was overwritten or malformed
                        # Don't trust existing handoffs - force a new one
                        log_stderr(f"No assignment timestamp found - cannot validate handoff age, forcing new handoff")
                        continue
                    # If neither has timestamp (legacy), allow the handoff
                    elif not handoff_ts:
                        return None
            except Exception:
                pass

        # Check pending files for this project
        for hf in pending_files:
            try:
                import yaml
                data = yaml.safe_load(hf.read_text())
                if data.get('project') == project_name:
                    # Check if handoff is NEWER than current assignment
                    handoff_ts = normalize_timestamp(data.get('timestamp', ''))
                    assignment_ts = normalize_timestamp(assignment_timestamp or '')

                    # If we have BOTH timestamps, compare them
                    if handoff_ts and assignment_ts:
                        if handoff_ts < assignment_ts:
                            # Handoff is OLDER than assignment - don't count it
                            log_stderr(f"Ignoring stale pending handoff (handoff: {handoff_ts}, assignment: {assignment_ts})")
                            continue
                    elif handoff_ts and not assignment_ts:
                        # No assignment timestamp - can't validate, force new handoff
                        log_stderr(f"No assignment timestamp found - cannot validate pending handoff age")
                        continue

                    # Pending handoff exists and is valid - wait for ACK
                    handoff_id = data.get('id', '')
                    acked = wait_for_ack(handoff_id, timeout_seconds=ack_timeout, poll_interval=poll_interval)
                    if not acked:
                        log_stderr(f"Existing handoff {handoff_id} not ACK'd - allowing stop anyway")

                    # Auto-progression for schema v2 teams
                    try:
                        team_config = load_team_config(docs_path)
                        handle_auto_progression(docs_path, agent, team_config)
                    except Exception as e:
                        log_stderr(f"Auto-progression error: {e}")

                    _clear_agent_state_file(docs_path, agent)
                    return None
            except Exception:
                pass

    # No existing handoff found - trigger atomic handoff
    handoff_id, error = trigger_handoff_atomic(docs_path, agent, agent_config['output_file'], timeout_config)
    if not handoff_id:
        return error or f"Work complete but handoff automation failed. Please run: /handoff {agent} dan"

    # Wait for coordinator ACK
    acked = wait_for_ack(handoff_id, timeout_seconds=ack_timeout, poll_interval=poll_interval)
    if not acked:
        log_stderr(f"Handoff {handoff_id} not ACK'd within {ack_timeout}s - allowing stop anyway")

    # Auto-progression for schema v2 teams
    try:
        team_config = load_team_config(docs_path)
        handle_auto_progression(docs_path, agent, team_config)
    except Exception as e:
        log_stderr(f"Auto-progression error: {e}")

    # Clear state file AFTER ACK confirmed (or timeout)
    _clear_agent_state_file(docs_path, agent)
    return None


def get_coordinator_file(docs_path: Path) -> Optional[str]:
    """Get note_taker's output file from team config (replaces coordinator pattern)."""
    try:
        team = load_team_config(docs_path)
        # Try note_taker first (new pattern), fall back to coordinator (legacy)
        note_taker_name = get_note_taker(team)
        if note_taker_name:
            note_taker_agent = next((a for a in team['team']['agents'] if a['name'] == note_taker_name), None)
            if note_taker_agent and note_taker_agent.get('output_file'):
                return note_taker_agent['output_file']
    except Exception:
        pass
    return None


def check_agent_output(docs_path: Path, agent: str) -> Optional[str]:
    """Check if agent's output file has required sections.

    Loads requirements from team config.
    Returns None if OK, error string if validation fails.
    """
    try:
        team = load_team_config(docs_path)
    except FileNotFoundError as e:
        # FIX: Fail loudly instead of silently skipping
        return f"Cannot validate output: {e}"
    except Exception as e:
        return f"Team config error: {e}"

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

    return None


def check_coordinator_status(docs_path: Path) -> Optional[str]:
    """Check coordinator's output file for incomplete markers."""
    coordinator_file = get_coordinator_file(docs_path)
    if not coordinator_file:
        return None  # No valid team config

    coordinator_path = docs_path / coordinator_file

    if not coordinator_path.exists():
        return None  # No coordinator file yet

    content = coordinator_path.read_text()

    if 'STATUS: IN_PROGRESS' in content.upper() or 'Status: IN_PROGRESS' in content:
        return f"Work marked as IN_PROGRESS in {coordinator_file}. Update status before stopping."

    return None


def main():
    # Check emergency override
    if check_force_stop():
        print(json.dumps({"decision": "approve"}))
        return

    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        # No input or invalid JSON, allow stop
        print(json.dumps({"decision": "approve"}))
        return

    # Get project path with strict validation
    docs_path, path_error = get_docs_path_strict()

    # Determine agent from environment
    agent = os.environ.get('AGENT_NAME', '').lower()

    if not docs_path:
        # No active project - check if agent requires one
        if not agent:
            # No agent identity, no project - allow stop
            print(json.dumps({"decision": "approve"}))
            return

        # Agent has identity but no project - this might be OK for some agents
        # Allow stop but log warning
        log_stderr(f"WARNING: {path_error}")
        print(json.dumps({"decision": "approve"}))
        return

    # Load timeout configuration
    timeout_config = {}
    try:
        team = load_team_config(docs_path)
        timeout_config = get_timeout_config(team)
    except Exception as e:
        log_stderr(f"Could not load timeout config: {e}")

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
            pass

        if not agent:
            # FIX: Block stop if we can't determine agent identity
            # Previously silently approved
            print(json.dumps({
                "decision": "block",
                "reason": "Cannot determine agent identity. Set AGENT_NAME environment variable."
            }))
            return

    # Agents with multi_instance: true are exempt from workflow validation
    try:
        team = load_team_config(docs_path)
        agent_config = get_agent_config(team, agent)
        if agent_config and agent_config.get('multi_instance', False):
            # Still log for visibility
            log_stderr(f"Agent {agent} has multi_instance=true - workflow validation skipped")
            print(json.dumps({"decision": "approve"}))
            return
    except Exception:
        pass

    # Check agent-specific output
    error = check_agent_output(docs_path, agent)
    if error:
        print(json.dumps({
            "decision": "block",
            "reason": error
        }))
        return

    # Check handoff was done (only for workflow participant agents)
    # Uses agent-to-agent handoff pattern based on workflow phases
    note_taker = None
    is_workflow_participant = True
    try:
        team = load_team_config(docs_path)
        note_taker = get_note_taker(team)
        # Check if agent is a workflow participant
        agent_config = get_agent_config(team, agent)
        if agent_config:
            is_workflow_participant = agent_config.get('workflow_participant', True)
    except Exception as e:
        log_stderr(f"Failed to load team config: {e}")

    # Non-workflow participants (like guardian, support agents) can always stop
    if not is_workflow_participant:
        log_stderr(f"Agent {agent} is not a workflow participant - skipping handoff validation")
        print(json.dumps({"decision": "approve"}))
        return

    # Note taker (replaces coordinator) handles pending handoffs
    if agent == note_taker:
        # Note taker: ACK pending handoffs and check project complete
        error = coordinator_stop_check(docs_path)
        if error:
            print(json.dumps({
                "decision": "block",
                "reason": error
            }))
            return
    else:
        # Workflow agent: trigger handoff to next agent and wait for ACK
        error = check_handoff_done(docs_path, agent, timeout_config)
        if error:
            print(json.dumps({
                "decision": "block",
                "reason": error
            }))
            return

    # Check coordinator's output file status (IN_PROGRESS check)
    error = check_coordinator_status(docs_path)
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
