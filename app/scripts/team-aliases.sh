# Agent communication aliases - reliable messaging for interactive CLI tools
# Supports: Claude Code, Codex, Gemini CLI, and similar TTY-based tools
#
# Key features:
# - capture-pane polling for delivery verification (pipe-pane incompatible with Claude Code)
# - Copy-mode detection and exit before sending
# - Message IDs for tracking and verification
# - Parallel-safe with inter-message delays

set -o pipefail

# ===== CONFIGURATION =====
NOLAN_ROOT="${NOLAN_ROOT:-$HOME/.nolan}"
NOLAN_MAILBOX="${NOLAN_MAILBOX:-$NOLAN_ROOT/mailbox}"
NOLAN_MSG_TIMEOUT="${NOLAN_MSG_TIMEOUT:-5}"
NOLAN_MSG_RETRY="${NOLAN_MSG_RETRY:-2}"
NOLAN_DEFAULT_TEAM="${NOLAN_DEFAULT_TEAM:-default}"

# Ensure mailbox directory exists
mkdir -p "$NOLAN_MAILBOX"

# ===== TEAM-INDEPENDENT AGENTS =====
# Load team-independent agents from agent.json files
# These agents don't get team-scoped session names
_load_team_independent_agents() {
    local agents_dir="${NOLAN_ROOT}/app/agents"
    local independent=""

    # Check each agent directory for agent.json with team_independent: true
    for agent_dir in "$agents_dir"/*/; do
        [[ -d "$agent_dir" ]] || continue
        local agent_json="$agent_dir/agent.json"
        if [[ -f "$agent_json" ]]; then
            local is_independent=$(python3 -c "
import json, sys
try:
    with open('$agent_json') as f:
        data = json.load(f)
    print('true' if data.get('team_independent', False) else 'false')
except:
    print('false')
" 2>/dev/null)
            if [[ "$is_independent" == "true" ]]; then
                local name=$(basename "$agent_dir")
                independent="$independent $name"
            fi
        fi
    done

    echo $independent
}

# Cache team-independent agents at source time
TEAM_INDEPENDENT_AGENTS=$(_load_team_independent_agents)

# Check if an agent is team-independent
# Usage: _is_team_independent <agent_name>
_is_team_independent() {
    local agent="$1"
    # Extract base name (strip instance suffix like ralph-ziggy -> ralph)
    local base_name="${agent%%-*}"

    for independent in $TEAM_INDEPENDENT_AGENTS; do
        if [[ "$base_name" == "$independent" ]]; then
            return 0
        fi
    done
    return 1
}

# ===== SESSION NAMING PATTERNS =====
# Team-scoped naming convention:
# - Core agents: agent-{team}-{name} (e.g., agent-default-ana)
# - Spawned agents: agent-{team}-{name}-{instance} (e.g., agent-default-ana-2)
# - Team-independent agents: agent-{name}-{id} (e.g., agent-ralph-ziggy)
#   (determined by team_independent: true in agent.json)

# Pattern for team-scoped sessions (core + spawned)
RE_TEAM_SESSION='^agent-([a-z0-9]+)-([a-z]+)(-[a-z0-9]+)?$'
# Pattern for team-independent sessions (loaded from config)
RE_INDEPENDENT_SESSION='^agent-([a-z]+)-([a-z0-9]+)$'
# Pattern for legacy sessions (backwards compat)
RE_LEGACY_SESSION='^agent-([a-z]+)$'

# ===== CORE UTILITIES =====

# List agent sessions for a specific team
# Usage: _get_sessions [team] [include_independent]
# - team: team name (default: $NOLAN_DEFAULT_TEAM)
# - include_independent: "true" to include team-independent agent sessions (default: false)
_get_sessions() {
    local team="${1:-$NOLAN_DEFAULT_TEAM}"
    local include_independent="${2:-false}"
    local sessions=""

    # Get all tmux sessions
    local all_sessions=$(tmux list-sessions -F '#{session_name}' 2>/dev/null)

    for session in $all_sessions; do
        # Check team-scoped sessions: agent-{team}-{name}[-{instance}]
        if [[ "$session" =~ ^agent-([a-z0-9]+)-([a-z]+)(-[a-z0-9]+)?$ ]]; then
            local session_team="${BASH_REMATCH[1]}"
            # Only include sessions from the specified team
            if [ "$session_team" = "$team" ]; then
                sessions="$sessions $session"
            fi
        # Check team-independent sessions (from config)
        elif [[ "$session" =~ ^agent-([a-z]+)-([a-z0-9]+)$ ]] && [ "$include_independent" = "true" ]; then
            local agent_name="${BASH_REMATCH[1]}"
            if _is_team_independent "$agent_name"; then
                sessions="$sessions $session"
            fi
        fi
    done

    echo $sessions | tr ' ' '\n' | grep -v '^$' | sort
}

# Check if agent session exists (team-scoped)
# Usage: _agent_exists <agent> [team]
_agent_exists() {
    local agent="$1"
    local team="${2:-$NOLAN_DEFAULT_TEAM}"
    local session=$(_build_session_name "$team" "$agent")
    tmux has-session -t "$session" 2>/dev/null
}

# Build session name from team and agent target
# Usage: _build_session_name <team> <target>
# - For team-independent: agent-{name}[-{id}]
# - For spawned: agent-{team}-{name}-{instance}
# - For core: agent-{team}-{name}
_build_session_name() {
    local team="$1"
    local target="$2"

    # Check if agent is team-independent (from config)
    if _is_team_independent "$target"; then
        echo "agent-$target"
    # Spawned instance: name-instance -> agent-{team}-{name}-{instance}
    elif [[ "$target" =~ ^([a-z]+)-([a-z0-9]+)$ ]]; then
        local base="${BASH_REMATCH[1]}"
        local instance="${BASH_REMATCH[2]}"
        # Check if base agent is team-independent
        if _is_team_independent "$base"; then
            echo "agent-$target"
        else
            echo "agent-$team-$base-$instance"
        fi
    # Core agent: name -> agent-{team}-{name}
    else
        echo "agent-$team-$target"
    fi
}

# Extract agent name from session (strips team prefix)
# Usage: _extract_agent_name <session>
# Returns: agent name (or name-instance for spawned/team-independent)
_extract_agent_name() {
    local session="$1"

    # Team-independent: agent-{name}-{id} (check FIRST)
    if [[ "$session" =~ ^agent-([a-z]+)-([a-z0-9]+)$ ]]; then
        local name="${BASH_REMATCH[1]}"
        local suffix="${BASH_REMATCH[2]}"
        if _is_team_independent "$name"; then
            echo "$name-$suffix"
            return
        fi
    fi

    # Team-scoped spawned: agent-{team}-{name}-{instance}
    if [[ "$session" =~ ^agent-([a-z0-9]+)-([a-z]+)-([a-z0-9]+)$ ]]; then
        echo "${BASH_REMATCH[2]}-${BASH_REMATCH[3]}"
    # Team-scoped core: agent-{team}-{name}
    elif [[ "$session" =~ ^agent-([a-z0-9]+)-([a-z]+)$ ]]; then
        echo "${BASH_REMATCH[2]}"
    # Legacy: agent-{name}
    elif [[ "$session" =~ ^agent-([a-z]+)$ ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "$session"
    fi
}

# Get output log path for an agent
_outlog() {
    echo "$NOLAN_MAILBOX/$1.out"
}

# Generate unique message ID with sender identity
# Format: MSG_<SENDER>_<8-hex-chars>
# Usage: _msg_id [sender]
# If AGENT_NAME env is set and sender not provided, uses AGENT_NAME
# Otherwise defaults to "USER" for messages from nolan app/cli
_msg_id() {
    local sender="${1:-${AGENT_NAME:-USER}}"
    # Uppercase the sender name
    sender=$(echo "$sender" | tr '[:lower:]' '[:upper:]')
    echo "MSG_${sender}_$(date +%s%N | sha256sum | cut -c1-8)"
}

# ===== OUTPUT CAPTURE =====
# Uses tmux pipe-pane for continuous output logging (more reliable than capture-pane polling)

# Enable output capture for an agent session
enable_capture() {
    local agent="$1"
    local session="agent-$agent"
    local outlog=$(_outlog "$agent")

    _agent_exists "$agent" || { echo "Agent '$agent' not found"; return 1; }

    # Start piping output to log file (appends, survives reconnects)
    tmux pipe-pane -t "$session" -o "cat >> '$outlog'"
    echo "Output capture enabled: $outlog"
}

# Disable output capture
disable_capture() {
    local agent="$1"
    _agent_exists "$agent" || return 1
    tmux pipe-pane -t "agent-$agent"
    echo "Output capture disabled for $agent"
}

# Truncate log if over 1MB to prevent bloat
_maybe_truncate_log() {
    local outlog="$1"
    local max_size=1048576  # 1MB
    [ -f "$outlog" ] || return 0
    local size=$(stat -c%s "$outlog" 2>/dev/null || echo 0)
    if [ "$size" -gt "$max_size" ]; then
        # Keep last 100KB
        tail -c 102400 "$outlog" > "${outlog}.tmp" && mv "${outlog}.tmp" "$outlog"
    fi
}

# Auto-enable capture for all agents (call on source or after new agents start)
_init_capture() {
    for session in $(_get_sessions); do
        local agent="${session#agent-}"
        local outlog=$(_outlog "$agent")
        [ -f "$outlog" ] || touch "$outlog"
        _maybe_truncate_log "$outlog"
        tmux pipe-pane -t "$session" -o "cat >> '$outlog'" 2>/dev/null
    done
}

# ===== COPY-MODE HANDLING =====
# Ensures pane is not in scroll mode before sending

_exit_copy_mode() {
    local session="$1"
    local in_mode=$(tmux display-message -t "$session" -p '#{pane_in_mode}' 2>/dev/null)

    [ "$in_mode" = "1" ] || return 0

    # Try 'q' first (standard), then Escape (fallback)
    tmux send-keys -t "$session" q
    sleep 0.05

    in_mode=$(tmux display-message -t "$session" -p '#{pane_in_mode}' 2>/dev/null)
    [ "$in_mode" = "1" ] && tmux send-keys -t "$session" Escape
    sleep 0.05

    # Clear any artifacts from copy mode exit (prevents leading brackets)
    tmux send-keys -t "$session" C-u
    sleep 0.02
}

# ===== MESSAGE DELIVERY =====

# Wait for message ID to appear in pane output (by session name)
# Uses capture-pane polling (pipe-pane doesn't work with Claude Code)
_wait_for_delivery_session() {
    local session="$1"
    local msg_id="$2"
    local timeout="$3"
    local deadline=$(($(date +%s) + timeout))

    # Poll capture-pane for message ID
    while [ $(date +%s) -lt $deadline ]; do
        if tmux capture-pane -t "$session" -p -S -200 2>/dev/null | grep -q "$msg_id"; then
            return 0
        fi
        sleep 0.3
    done

    return 1
}

# Legacy wrapper for backwards compatibility
_wait_for_delivery() {
    local agent="$1"
    local msg_id="$2"
    local timeout="$3"
    local session=$(_build_session_name "$NOLAN_DEFAULT_TEAM" "$agent")
    _wait_for_delivery_session "$session" "$msg_id" "$timeout"
}

# Send message using bracketed paste mode (safer for special characters and multi-line)
# Bracketed paste: \e[200~ starts paste, \e[201~ ends paste
# This is standard and supported by most modern terminals/CLI tools
_send_bracketed() {
    local session="$1"
    local message="$2"

    # Start bracketed paste
    tmux send-keys -t "$session" -l $'\e[200~'

    # Send message content (literal mode preserves special chars)
    tmux send-keys -t "$session" -l "$message"

    # End bracketed paste
    tmux send-keys -t "$session" -l $'\e[201~'

    # Small delay then submit
    sleep 0.03
    tmux send-keys -t "$session" C-m
}

# Send message with plain send-keys
_send_plain() {
    local session="$1"
    local message="$2"

    tmux send-keys -t "$session" -l "$message"
    sleep 0.03
    tmux send-keys -t "$session" C-m
}

# Force submit (retry C-m if stuck in input mode)
_force_submit() {
    local session="$1"
    sleep 0.1
    tmux send-keys -t "$session" C-m
    sleep 0.3
}

# ===== MAIN SEND FUNCTION =====

# Send verified message to agent (team-scoped)
# Usage: send <agent> "message" [team] [timeout] [retries]
# Returns: 0=delivered, 1=timeout, 2=agent not found
# NOTE: For reliable delivery, use sequential sends. Parallel sends may concatenate.
send() {
    local agent="$1"
    local message="$2"
    local team="${3:-$NOLAN_DEFAULT_TEAM}"
    local timeout="${4:-$NOLAN_MSG_TIMEOUT}"
    local retries="${5:-$NOLAN_MSG_RETRY}"
    local session=$(_build_session_name "$team" "$agent")

    # Validate agent exists (team-scoped)
    _agent_exists "$agent" "$team" || { echo "Agent '$agent' not found in team '$team'"; return 2; }

    # Generate message ID
    local msg_id=$(_msg_id)
    local full_msg="${msg_id}: ${message}"

    local attempt=0
    while [ $attempt -le $retries ]; do
        [ $attempt -gt 0 ] && echo "  Retry $attempt/$retries..."

        # Prepare pane (exit copy mode if active)
        _exit_copy_mode "$session"

        # Send message
        _send_plain "$session" "$full_msg"

        # Wait for delivery confirmation via capture-pane
        if _wait_for_delivery_session "$session" "$msg_id" "$timeout"; then
            echo "✓ Delivered to $agent: $msg_id"
            return 0
        fi

        # Check if stuck (prompt visible or paste indicator) and force submit
        local pane=$(tmux capture-pane -t "$session" -p 2>/dev/null)
        if echo "$pane" | grep -qE "^>|\[Pasted text"; then
            echo "  Force submit..."
            _force_submit "$session"
            sleep 0.5

            # Re-check delivery after force submit
            if tmux capture-pane -t "$session" -p -S -100 2>/dev/null | grep -q "$msg_id"; then
                echo "✓ Delivered to $agent (after force): $msg_id"
                return 0
            fi
        fi

        ((attempt++))
    done

    echo "✗ Failed to deliver to $agent in team '$team' after $((retries + 1)) attempts"
    return 1
}

# Alias for backward compatibility (defaults to default team)
send_verified() { send "$@"; }

# ===== AGENT FUNCTIONS =====

# List active agents for a team
# Usage: list_agents [team]
list_agents() {
    local team="${1:-$NOLAN_DEFAULT_TEAM}"
    local agents=$(_get_sessions "$team" "true")
    [ -z "$agents" ] && echo "No active agents in team '$team'" && return 1
    echo "=== Active Agents (team: $team) ==="
    for session in $agents; do
        local agent=$(_extract_agent_name "$session")
        echo "  $agent ($session)"
    done
}

# Build dynamic functions for a team (ana "msg", carl "msg", etc.)
# Functions are team-scoped: ana() sends to agent in current team
# Usage: _build_functions [team]
_build_functions() {
    local team="${1:-$NOLAN_DEFAULT_TEAM}"

    for session in $(_get_sessions "$team" "true"); do
        local agent=$(_extract_agent_name "$session")
        local func="${agent//-/_}"  # ana-2 -> ana_2, ralph-ziggy -> ralph_ziggy

        # Create function that sends to this agent in the specified team
        eval "${func}() { send '$agent' \"\$1\" '$team' \"\${2:-\$NOLAN_MSG_TIMEOUT}\" \"\${3:-\$NOLAN_MSG_RETRY}\"; }"
    done
}

# Rebuild aliases for a team (call after new agents start)
# Usage: rebuild [team]
rebuild() {
    local team="${1:-$NOLAN_DEFAULT_TEAM}"
    _build_functions "$team"
    echo "Rebuilt aliases for team '$team'"
    list_agents "$team"
}

# ===== BROADCAST =====

# Broadcast to core agents in a team (team-isolated)
# Usage: _broadcast_team <team> <message>
_broadcast_team() {
    local team="$1"
    local message="$2"
    local count=0 failed=0

    # Get all sessions for this team
    local all_sessions=$(tmux list-sessions -F '#{session_name}' 2>/dev/null)

    for session in $all_sessions; do
        # Team-scoped core only: agent-{team}-{name}
        if [[ "$session" =~ ^agent-([a-z0-9]+)-([a-z]+)$ ]]; then
            local session_team="${BASH_REMATCH[1]}"
            if [ "$session_team" = "$team" ]; then
                local agent="${BASH_REMATCH[2]}"
                if send "$agent" "$message" "$team"; then
                    ((count++))
                else
                    ((failed++))
                fi
            fi
        fi
        # NOTE: Spawned instances and Ralph are NOT included in team broadcasts
    done

    [ $count -eq 0 ] && [ $failed -eq 0 ] && echo "No agents in team '$team'" && return 1

    echo "Broadcast to team '$team': $count delivered, $failed failed"
    [ $failed -eq 0 ]
}

# Send to core agents only in current team
# Usage: team "message" [team_name]
team() {
    local message="$1"
    local team="${2:-$NOLAN_DEFAULT_TEAM}"
    _broadcast_team "$team" "$message"
}

# ===== DEBUGGING =====

# Show agent's recent output (uses capture-pane - most reliable for Claude Code)
# Usage: show <agent> [lines] [team]
show() {
    local agent="$1"
    local lines="${2:-30}"
    local team="${3:-$NOLAN_DEFAULT_TEAM}"
    local session=$(_build_session_name "$team" "$agent")

    _agent_exists "$agent" "$team" || { echo "Agent '$agent' not found in team '$team'"; return 1; }

    echo "=== $agent pane (last $lines lines) ==="
    tmux capture-pane -t "$session" -p -S "-$lines"
}

# Check if message was delivered (uses capture-pane)
# Usage: check <agent> <msg_id> [team]
check() {
    local agent="$1"
    local msg_id="$2"
    local team="${3:-$NOLAN_DEFAULT_TEAM}"
    local session=$(_build_session_name "$team" "$agent")

    [ -z "$msg_id" ] && echo "Usage: check <agent> <msg_id> [team]" && return 1
    _agent_exists "$agent" "$team" || { echo "Agent '$agent' not found in team '$team'"; return 1; }

    if tmux capture-pane -t "$session" -p -S -200 | grep -q "$msg_id"; then
        echo "✓ Found: $msg_id"
        return 0
    fi

    echo "✗ Not found: $msg_id"
    return 1
}

# Show agent output log path
# Usage: logpath <agent> [team]
logpath() {
    local agent="$1"
    local team="${2:-$NOLAN_DEFAULT_TEAM}"
    _agent_exists "$agent" "$team" || { echo "Agent '$agent' not found in team '$team'"; return 1; }
    echo $(_outlog "$agent")
}

# Tail agent output in real-time
# Usage: tail_agent <agent> [team]
tail_agent() {
    local agent="$1"
    local team="${2:-$NOLAN_DEFAULT_TEAM}"
    _agent_exists "$agent" "$team" || { echo "Agent '$agent' not found in team '$team'"; return 1; }

    local outlog=$(_outlog "$agent")
    [ -f "$outlog" ] || { echo "No output log for $agent"; return 1; }

    echo "=== Tailing $agent output (Ctrl+C to stop) ==="
    tail -f "$outlog"
}

# ===== HELP =====

help() {
    cat <<'EOF'
AGENT COMMUNICATION (Team-Scoped)

  list_agents [team]        Show active agents in team (default: $NOLAN_DEFAULT_TEAM)
  rebuild [team]            Rebuild aliases for team after new agents start

SEND (with delivery confirmation)
  send <agent> "msg" [team] [timeout] [retries]
  <agent> "msg"             Shorthand (e.g., ana "Hello", carl_2 "msg")
                            Uses current team from $NOLAN_DEFAULT_TEAM

BROADCAST (team-isolated, core agents only)
  team "msg" [team]         Broadcast to core agents in specified team

OUTPUT & DEBUGGING
  show <agent> [lines] [team]    Recent output from pane
  tail_agent <agent> [team]      Real-time output tail
  check <agent> <msg_id> [team]  Verify delivery
  logpath <agent> [team]         Show output log path

OUTPUT CAPTURE
  enable_capture <agent>    Start logging agent output
  disable_capture <agent>   Stop logging

CONFIGURATION (environment variables)
  NOLAN_DEFAULT_TEAM  Active team context (default: default)
  NOLAN_MAILBOX       Output log directory (default: ~/.nolan/mailbox)
  NOLAN_MSG_TIMEOUT   Delivery timeout in seconds (default: 5)
  NOLAN_MSG_RETRY     Retry attempts (default: 2)

SESSION NAMING CONVENTION
  Core agents:    agent-{team}-{name}           (e.g., agent-default-ana)
  Spawned:        agent-{team}-{name}-{instance} (e.g., agent-default-ana-2)
  Ralph:          agent-ralph-{id}              (e.g., agent-ralph-ziggy)

NOTES
  - Team isolation: Messages are scoped to a team. Use NOLAN_DEFAULT_TEAM to set context.
  - Ralph is team-independent and can be messaged from any team
  - Broadcasts only reach core agents (spawned instances excluded)
  - Use single quotes for messages with special chars: send ana 'path is $HOME'
  - Functions are exported for subshell use (parallel with &)
EOF
}

# Aliases for backward compatibility
help_aliases() { help; }
show-agent() { show "$@"; }
check-delivery() { check "$@"; }
rebuild_aliases() { rebuild; }

# ===== EXPORT FUNCTIONS FOR SUBSHELLS =====
# Required for parallel execution with & or xargs
export -f _get_sessions _agent_exists _outlog _msg_id
export -f _build_session_name _extract_agent_name
export -f _exit_copy_mode _wait_for_delivery _wait_for_delivery_session _send_plain _force_submit
export -f send send_verified list_agents rebuild
export -f enable_capture disable_capture
export -f show check logpath tail_agent
export -f team _broadcast_team

# Export config vars
export NOLAN_ROOT NOLAN_MAILBOX NOLAN_MSG_TIMEOUT NOLAN_MSG_RETRY NOLAN_DEFAULT_TEAM

# ===== INITIALIZATION =====
# Note: pipe-pane capture removed - incompatible with Claude Code sessions
_build_functions "$NOLAN_DEFAULT_TEAM"

# Export dynamic agent functions after building
_export_agent_functions() {
    local team="${1:-$NOLAN_DEFAULT_TEAM}"
    for session in $(_get_sessions "$team" "true"); do
        local agent=$(_extract_agent_name "$session")
        local func="${agent//-/_}"
        export -f "$func" 2>/dev/null || true
    done
}
_export_agent_functions "$NOLAN_DEFAULT_TEAM"
