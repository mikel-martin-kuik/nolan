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


def load_team_config(project_path: Path) -> dict:
    """Load team configuration for a project.

    Security: Includes DoS protection (file size limit, depth limit).
    Requires .team file - raises exception if not found.
    """
    team_file = project_path / '.team'
    if not team_file.exists():
        raise FileNotFoundError(f".team file not found in {project_path}")
    team_name = team_file.read_text().strip()

    nolan_root = os.environ.get('NOLAN_ROOT')
    if not nolan_root:
        raise EnvironmentError("NOLAN_ROOT environment variable not set")

    config_path = Path(nolan_root) / 'teams' / f'{team_name}.yaml'

    if not config_path.exists():
        raise FileNotFoundError(f"Team config not found: {config_path}")

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

    if agent:
        # Try team-namespaced state file first
        state_file = projects_base / '.state' / team_name / f'active-{agent}.txt'
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
        legacy_state = projects_base / '.state' / f'active-{agent}.txt'
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
        f"Set DOCS_PATH or create state file at: {projects_base}/.state/{team_name}/active-{agent}.txt"
    )


def generate_handoff_id() -> str:
    """Generate unique handoff ID."""
    import hashlib
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')
    return hashlib.sha256(timestamp.encode()).hexdigest()[:12]


def notify_coordinator(agent: str, project_name: str, handoff_id: str, team_name: str = "default"):
    """Send wake-up notification to coordinator via tmux.

    This wakes the coordinator from sleep state so they can ACK the handoff.
    Uses the team-aliases.sh messaging system.
    """
    import subprocess

    # Get coordinator name from team config (default to 'dan')
    coordinator = 'dan'
    try:
        nolan_root = os.environ.get('NOLAN_ROOT')
        if nolan_root:
            config_path = Path(nolan_root) / 'teams' / f'{team_name}.yaml'
            if config_path.exists():
                with open(config_path) as f:
                    config = yaml.safe_load(f)
                coordinator = config.get('team', {}).get('workflow', {}).get('coordinator', 'dan')
    except Exception:
        pass

    # Build session name for coordinator
    session_name = f"agent-{team_name}-{coordinator}"

    # Check if coordinator session exists
    try:
        result = subprocess.run(
            ['tmux', 'has-session', '-t', session_name],
            capture_output=True, timeout=2
        )
        if result.returncode != 0:
            log_stderr(f"Coordinator session '{session_name}' not found - cannot send wake notification")
            return False
    except Exception as e:
        log_stderr(f"Failed to check coordinator session: {e}")
        return False

    # Build wake-up message
    msg_id = f"HANDOFF_{handoff_id[:8]}"
    message = f"{msg_id}: Handoff from {agent} - project '{project_name}' ready for coordination"

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

        log_stderr(f"Sent wake notification to {coordinator}: {msg_id}")
        return True

    except subprocess.TimeoutExpired:
        log_stderr(f"Timeout sending wake notification to {coordinator}")
        return False
    except Exception as e:
        log_stderr(f"Failed to send wake notification: {e}")
        return False


def write_handoff_file_atomic(agent: str, project_name: str, project_path: Path,
                               handoff_id: str, status: str = "COMPLETE") -> bool:
    """Write handoff file atomically using temp file + rename.

    Returns True on success, False on failure.
    This ensures the handoff file is either fully written or not at all.
    """
    projects_dir = get_projects_base()
    if not projects_dir:
        log_stderr("Cannot write handoff: projects_dir not found")
        return False

    pending_dir = projects_dir / '.handoffs' / 'pending'
    lock_file = projects_dir / '.handoffs' / '.lock-pending'

    try:
        pending_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
        timestamp_file = datetime.now().strftime('%Y%m%d_%H%M%S')

        filename = f"{timestamp_file}_{agent}_{handoff_id}.handoff"
        final_path = pending_dir / filename

        # Get team info
        team_name = "unknown"
        try:
            team_file = project_path / '.team'
            if team_file.exists():
                team_name = team_file.read_text().strip()
        except Exception:
            pass

        # Build handoff data
        handoff_data = {
            'id': handoff_id,
            'timestamp': timestamp,
            'from_agent': agent,
            'to_agent': 'dan',  # Always to coordinator for now
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

    projects_dir = get_projects_base()
    if not projects_dir:
        return False

    pending_dir = projects_dir / '.handoffs' / 'pending'
    processed_dir = projects_dir / '.handoffs' / 'processed'

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
    projects_dir = get_projects_base()
    if not projects_dir:
        return 0, 0

    pending_dir = projects_dir / '.handoffs' / 'pending'
    processed_dir = projects_dir / '.handoffs' / 'processed'
    lock_file = projects_dir / '.handoffs' / '.lock-pending'

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


def check_project_complete(docs_path: Path) -> bool:
    """Check if project has final phase complete marker.

    Returns True ONLY if project is explicitly marked COMPLETE/CLOSED/ARCHIVED.
    Missing coordinator file = NOT complete (was a false positive before).
    """
    coordinator_file = get_coordinator_file(docs_path)
    if not coordinator_file:
        # No coordinator file configured - can't determine completion
        # This is NOT a false positive - we require explicit completion marker
        return False

    coord_path = docs_path / coordinator_file
    if not coord_path.exists():
        # Coordinator file doesn't exist yet - project NOT complete
        # FIX: Previously returned True (false positive)
        return False

    content = coord_path.read_text()

    # Check for completion markers
    if '<!-- PROJECT:STATUS:COMPLETE' in content:
        return True
    if '<!-- PROJECT:STATUS:CLOSED' in content:
        return True
    if '<!-- PROJECT:STATUS:ARCHIVED' in content:
        return True

    return False


def check_project_delegated(docs_path: Path) -> bool:
    """Check if project is in DELEGATED state (coordinator waiting for handoff).

    Returns True if project is marked DELEGATED - coordinator has delegated work
    to another agent and is waiting for their handoff. This is a valid stopping
    state for coordinators.
    """
    coordinator_file = get_coordinator_file(docs_path)
    if not coordinator_file:
        return False

    coord_path = docs_path / coordinator_file
    if not coord_path.exists():
        return False

    content = coord_path.read_text()

    # Check for delegated marker
    if '<!-- PROJECT:STATUS:DELEGATED' in content:
        return True

    return False


def check_project_pending(docs_path: Path) -> bool:
    """Check if project is in PENDING state (awaiting assignment).

    Returns True if project is marked PENDING - coordinator can stop while
    project remains visible and available for assignment. Unlike COMPLETE,
    PENDING projects stay in the active projects list.
    """
    coordinator_file = get_coordinator_file(docs_path)
    if not coordinator_file:
        return False

    coord_path = docs_path / coordinator_file
    if not coord_path.exists():
        return False

    content = coord_path.read_text()

    # Check for pending marker
    if '<!-- PROJECT:STATUS:PENDING' in content:
        return True

    return False


def coordinator_stop_check(docs_path: Path) -> Optional[str]:
    """Coordinator stop check - ACK pending handoffs and verify project status.

    Dan (coordinator) runs this when trying to stop:
    1. Auto-ACK any pending handoffs (unblocks waiting agents)
    2. Check if project is marked complete, delegated, or pending
    3. Block stop if none of these (Dan should add marker first)

    Returns None to allow stop, or error string to block.
    """
    project_name = docs_path.name if docs_path else "unknown"

    # Auto-ACK any pending handoffs (unblocks agents immediately)
    success_count, failure_count = auto_ack_pending_handoffs()
    if success_count > 0:
        log_stderr(f"Auto-ACK'd {success_count} handoff(s)")
    if failure_count > 0:
        log_stderr(f"WARNING: Failed to ACK {failure_count} handoff(s)")

    # Check if project is complete
    if check_project_complete(docs_path):
        return None  # Project complete, allow stop

    # Check if project is delegated (coordinator waiting for handoff)
    if check_project_delegated(docs_path):
        log_stderr(f"Project '{project_name}' is DELEGATED - coordinator can sleep while waiting")
        return None  # Delegated, allow stop

    # Check if project is pending (awaiting assignment, stays visible)
    if check_project_pending(docs_path):
        log_stderr(f"Project '{project_name}' is PENDING - coordinator can stop, project remains active")
        return None  # Pending, allow stop

    # Not complete, delegated, or pending - block stop with helpful message
    return f"Project '{project_name}' requires status marker. Use PENDING (stays active), DELEGATED (assigned), or COMPLETE (finished)."


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
        # Generate handoff ID for tracking
        handoff_id = generate_handoff_id()
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M')

        # Get team name for state management
        team_name = "default"
        try:
            team_file = docs_path / '.team'
            if team_file.exists():
                team_name = team_file.read_text().strip()
        except Exception:
            pass

        # STEP 1: Write queue file FIRST (atomic)
        # FIX: This was step 2 before, causing race condition
        if not write_handoff_file_atomic(agent, docs_path.name, docs_path, handoff_id, "COMPLETE"):
            return None, "Failed to write handoff queue file. Check disk space and permissions."

        # STEP 2: Add marker to output file (only if queue write succeeded)
        handoff_marker = (
            f"\n---\n**Handoff:** Queued for dan at {timestamp} (ID: {handoff_id})\n"
            f"<!-- HANDOFF:{timestamp}:{agent}:COMPLETE:{handoff_id} -->"
        )

        try:
            with open(filepath, 'a') as f:
                f.write(handoff_marker)
        except Exception as e:
            # Queue file exists but marker write failed - this is OK
            # The handoff will still be processed, marker is just for visibility
            log_stderr(f"Warning: Handoff queued but marker write failed: {e}")

        # STEP 3: Send wake-up notification to coordinator
        # This wakes the coordinator from sleep state so they can ACK the handoff
        notify_coordinator(agent, docs_path.name, handoff_id, team_name)

        # NOTE: State file clearing moved to check_handoff_done() after ACK confirmed
        # This prevents state loss if ACK times out

        return handoff_id, None

    except Exception as e:
        return None, f"Handoff failed: {e}"


def _clear_agent_state_file(docs_path: Path, agent: str):
    """Clear active project state file after successful handoff."""
    projects_base = get_projects_base()
    if not projects_base or not agent:
        return

    # Get team name for namespaced state file
    team_name = "default"
    try:
        team_file = docs_path / '.team'
        if team_file.exists():
            team_name = team_file.read_text().strip()
    except Exception:
        pass

    for state_file in [
        projects_base / '.state' / team_name / f'active-{agent}.txt',
        projects_base / '.state' / f'active-{agent}.txt'  # Legacy fallback
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

    # Required sections present - check for handoff marker with ID
    marker_pattern = r'<!-- HANDOFF:\d{4}-\d{2}-\d{2} \d{2}:\d{2}:[a-z]+:COMPLETE:([a-f0-9]+) -->'
    marker_match = re.search(marker_pattern, content)

    ack_timeout = timeout_config.get('ack_timeout_seconds', DEFAULT_ACK_TIMEOUT_SECONDS)
    poll_interval = timeout_config.get('ack_poll_interval', DEFAULT_ACK_POLL_INTERVAL)

    if not marker_match:
        # Check for old format marker (without ID) - allow stop for backwards compat
        old_marker = r'<!-- HANDOFF:\d{4}-\d{2}-\d{2} \d{2}:\d{2}:[a-z]+:COMPLETE -->'
        if re.search(old_marker, content):
            return None  # Old format marker - allow stop

        # No marker found - trigger handoff atomically
        handoff_id, error = trigger_handoff_atomic(docs_path, agent, agent_config['output_file'], timeout_config)
        if not handoff_id:
            return error or f"Work complete but handoff automation failed. Please run: /handoff {agent} dan"

        # Wait for coordinator ACK
        acked = wait_for_ack(handoff_id, timeout_seconds=ack_timeout, poll_interval=poll_interval)
        if not acked:
            log_stderr(f"Handoff {handoff_id} not ACK'd within {ack_timeout}s - allowing stop anyway")

        # Clear state file AFTER ACK confirmed (or timeout)
        _clear_agent_state_file(docs_path, agent)
        return None

    # Marker with ID exists - check if already ACK'd
    handoff_id = marker_match.group(1)

    # Check if this handoff was already ACK'd (file in processed/)
    projects_dir = get_projects_base()
    if projects_dir:
        processed_dir = projects_dir / '.handoffs' / 'processed'
        pending_dir = projects_dir / '.handoffs' / 'pending'

        processed_files = list(processed_dir.glob(f'*{handoff_id}*.handoff')) if processed_dir.exists() else []
        pending_files = list(pending_dir.glob(f'*{handoff_id}*.handoff')) if pending_dir.exists() else []

        if processed_files:
            return None  # Already ACK'd, allow stop

        if pending_files:
            # Handoff still pending - wait for ACK
            acked = wait_for_ack(handoff_id, timeout_seconds=ack_timeout, poll_interval=poll_interval)
            if not acked:
                log_stderr(f"Existing handoff {handoff_id} not ACK'd - allowing stop anyway")
            # Clear state file after ACK (or timeout)
            _clear_agent_state_file(docs_path, agent)
            return None

    # No pending file found (edge case) - clear state and allow stop
    _clear_agent_state_file(docs_path, agent)
    return None


def get_coordinator_file(docs_path: Path) -> Optional[str]:
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

    # Check handoff was done (only for non-coordinator agents)
    coordinator = 'dan'  # fallback
    try:
        team = load_team_config(docs_path)
        coordinator = team['team']['workflow']['coordinator']
    except Exception:
        pass

    if agent != coordinator:
        # Non-coordinator: trigger handoff and wait for ACK
        error = check_handoff_done(docs_path, agent, timeout_config)
        if error:
            print(json.dumps({
                "decision": "block",
                "reason": error
            }))
            return
    else:
        # Coordinator: ACK pending handoffs and check project complete
        error = coordinator_stop_check(docs_path)
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
