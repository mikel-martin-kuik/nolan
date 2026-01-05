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

# Ensure mailbox directory exists
mkdir -p "$NOLAN_MAILBOX"

# ===== CORE UTILITIES =====

# List agent sessions (pattern: agent-<name> or agent-<name>-<N>)
_get_sessions() {
    local pattern="${1:-^agent-[a-z]+(-[0-9]+)?$}"
    tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "$pattern" | sort
}

# Check if agent exists
_agent_exists() {
    tmux has-session -t "agent-$1" 2>/dev/null
}

# Get output log path for an agent
_outlog() {
    echo "$NOLAN_MAILBOX/$1.out"
}

# Generate unique message ID
_msg_id() {
    echo "MSG_$(date +%s%N | sha256sum | cut -c1-8)"
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

# Wait for message ID to appear in pane output
# Uses capture-pane polling (pipe-pane doesn't work with Claude Code)
_wait_for_delivery() {
    local agent="$1"
    local msg_id="$2"
    local timeout="$3"
    local session="agent-$agent"
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

# Send verified message to agent
# Usage: send <agent> "message" [timeout] [retries]
# Returns: 0=delivered, 1=timeout, 2=agent not found
# NOTE: For reliable delivery, use sequential sends. Parallel sends may concatenate.
send() {
    local agent="$1"
    local message="$2"
    local timeout="${3:-$NOLAN_MSG_TIMEOUT}"
    local retries="${4:-$NOLAN_MSG_RETRY}"
    local session="agent-$agent"

    # Validate agent exists
    _agent_exists "$agent" || { echo "Agent '$agent' not found"; return 2; }

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
        if _wait_for_delivery "$agent" "$msg_id" "$timeout"; then
            echo "Delivered to $agent: $msg_id"
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
                echo "Delivered to $agent (after force): $msg_id"
                return 0
            fi
        fi

        ((attempt++))
    done

    echo "Failed to deliver to $agent after $((retries + 1)) attempts"
    return 1
}

# Alias for backward compatibility
send_verified() { send "$@"; }

# ===== AGENT FUNCTIONS =====

# List active agents
list_agents() {
    local agents=$(_get_sessions)
    [ -z "$agents" ] && echo "No active agents" && return 1
    echo "=== Active Agents ==="
    echo "$agents" | sed 's/^agent-/  /'
}

# Build dynamic functions (ana "msg", carl "msg", etc.)
_build_functions() {
    for session in $(_get_sessions); do
        local name="${session#agent-}"
        local func="${name//-/_}"  # ana-2 -> ana_2
        eval "${func}() { send '$name' \"\$@\"; }"
    done
}

# Rebuild aliases (call after new agents start)
rebuild() {
    _build_functions
    echo "Rebuilt aliases"
    list_agents
}

# ===== BROADCAST =====

# Internal broadcast helper
_broadcast() {
    local pattern="$1" label="$2"; shift 2
    local message="$*"
    local agents=$(_get_sessions "$pattern")
    local count=0 failed=0

    [ -z "$agents" ] && echo "No agents match pattern" && return 1

    for session in $agents; do
        if send "${session#agent-}" "$message"; then
            ((count++))
        else
            ((failed++))
        fi
    done

    echo "Broadcast to $label: $count delivered, $failed failed"
    [ $failed -eq 0 ]
}

# Send to core agents only (no spawned instances)
team() { _broadcast '^agent-[a-z]+$' "core team" "$@"; }

# Send to all agents (core + spawned)
all() { _broadcast '^agent-[a-z]+(-[0-9]+)?$' "all agents" "$@"; }

# ===== DEBUGGING =====

# Show agent's recent output (uses capture-pane - most reliable for Claude Code)
show() {
    local agent="$1"
    local lines="${2:-30}"

    _agent_exists "$agent" || { echo "Agent '$agent' not found"; return 1; }

    echo "=== $agent pane (last $lines lines) ==="
    tmux capture-pane -t "agent-$agent" -p -S "-$lines"
}

# Check if message was delivered (uses capture-pane)
check() {
    local agent="$1"
    local msg_id="$2"

    [ -z "$msg_id" ] && echo "Usage: check <agent> <msg_id>" && return 1
    _agent_exists "$agent" || { echo "Agent '$agent' not found"; return 1; }

    if tmux capture-pane -t "agent-$agent" -p -S -200 | grep -q "$msg_id"; then
        echo "Found: $msg_id"
        return 0
    fi

    echo "Not found: $msg_id"
    return 1
}

# Show agent output log path
logpath() {
    local agent="$1"
    _agent_exists "$agent" || { echo "Agent '$agent' not found"; return 1; }
    echo $(_outlog "$agent")
}

# Tail agent output in real-time
tail_agent() {
    local agent="$1"
    _agent_exists "$agent" || { echo "Agent '$agent' not found"; return 1; }

    local outlog=$(_outlog "$agent")
    [ -f "$outlog" ] || { echo "No output log for $agent"; return 1; }

    echo "=== Tailing $agent output (Ctrl+C to stop) ==="
    tail -f "$outlog"
}

# ===== HELP =====

help() {
    cat <<'EOF'
AGENT COMMUNICATION

  list_agents          Show active agents
  rebuild              Rebuild aliases after new agents start

SEND (with delivery confirmation)
  send <agent> "msg" [timeout] [retries]
  <agent> "msg"        Shorthand (e.g., ana "Hello", carl_2 "msg")

BROADCAST
  team "msg"           Core agents only
  all "msg"            All agents (core + spawned)

OUTPUT & DEBUGGING
  show <agent> [lines]     Recent output from log or pane
  tail_agent <agent>       Real-time output tail
  check <agent> <msg_id>   Verify delivery
  logpath <agent>          Show output log path

OUTPUT CAPTURE
  enable_capture <agent>   Start logging agent output
  disable_capture <agent>  Stop logging

CONFIGURATION (environment variables)
  NOLAN_MAILBOX       Output log directory (default: ~/.nolan/mailbox)
  NOLAN_MSG_TIMEOUT   Delivery timeout in seconds (default: 5)
  NOLAN_MSG_RETRY     Retry attempts (default: 2)

NOTES
  - Use single quotes for messages with special chars: send ana 'path is $HOME'
  - Functions are exported for subshell use (parallel with &)
  - Install inotify-tools for faster delivery confirmation
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
export -f _exit_copy_mode _wait_for_delivery _send_plain _force_submit
export -f send send_verified list_agents
export -f enable_capture disable_capture
export -f show check logpath tail_agent
export -f team all _broadcast

# Export config vars
export NOLAN_ROOT NOLAN_MAILBOX NOLAN_MSG_TIMEOUT NOLAN_MSG_RETRY

# ===== INITIALIZATION =====
# Note: pipe-pane capture removed - incompatible with Claude Code sessions
_build_functions

# Export dynamic agent functions after building
_export_agent_functions() {
    for session in $(_get_sessions); do
        local func="${session#agent-}"
        func="${func//-/_}"
        export -f "$func" 2>/dev/null || true
    done
}
_export_agent_functions
