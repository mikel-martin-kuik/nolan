# Agent communication aliases (read-only, no spawn/kill/shutdown)
# Dynamically discovers active agents from tmux sessions
# Note: Use C-m instead of Enter - Enter creates newlines in Claude Code input
# FIX: Added 50ms delay between text and keystroke to prevent race condition where
# Claude Code's input handler isn't ready for the C-m submission keystroke

# ===== RETRY CONFIGURATION =====
# Configure message delivery retry behavior
NOLAN_MSG_TIMEOUT="${NOLAN_MSG_TIMEOUT:-5}"              # Timeout per attempt (seconds)
NOLAN_MSG_POLL_INTERVAL="${NOLAN_MSG_POLL_INTERVAL:-0.2}" # Poll interval (seconds)
NOLAN_MSG_RETRY_COUNT="${NOLAN_MSG_RETRY_COUNT:-2}"      # Number of retries after initial attempt

# ===== DYNAMIC AGENT DISCOVERY =====
# Discovers all active agent sessions matching pattern: agent-<name> or agent-<name>-<number>

list_agents() {
    local agents=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E '^agent-[a-z]+(-[0-9]+)?$' | sort)
    if [ -z "$agents" ]; then
        echo "No active agent sessions found"
        return 1
    fi
    echo "=== Active Agent Sessions ==="
    echo "$agents" | sed 's/^agent-/  /'
}

# Get agent name from session (strips "agent-" prefix and returns just the name)
# For "agent-ana" returns "ana"
# For "agent-ana-2" returns "ana-2"
get_agent_name() {
    local session="$1"
    echo "${session#agent-}"  # Remove "agent-" prefix
}

# Check if a specific agent session exists
agent_exists() {
    local agent="$1"
    local session="agent-${agent}"
    tmux has-session -t "$session" 2>/dev/null
}

# ===== VERIFIED SEND (with receipt confirmation) =====
# Usage: send_verified "ana" "message" [timeout_seconds]
# Usage: send_verified "ana-2" "message to spawned" [timeout_seconds]
# Returns: 0 if delivered, 1 if timeout, 2 if agent not found

send_verified() {
    local agent="$1"
    local message="$2"
    local timeout="${3:-${NOLAN_MSG_TIMEOUT}}"
    local retry_count="${4:-${NOLAN_MSG_RETRY_COUNT}}"
    local session="agent-${agent}"

    if ! agent_exists "$agent"; then
        echo "✗ Error: Agent '${agent}' not found. Use 'list_agents' to see active agents."
        return 2
    fi

    local msg_id="MSG_$(date +%s%N | sha256sum | cut -c1-8)"
    local prefixed_msg="${msg_id}: ${message}"
    local attempt=0

    while [ $attempt -le $retry_count ]; do
        [ $attempt -gt 0 ] && echo "  ↻ Retry $attempt of $retry_count for ${agent}"

        # Send message with ID prefix
        tmux send-keys -t "$session" -l "$prefixed_msg"
        sleep 0.05
        tmux send-keys -t "$session" C-m

        # Poll for delivery with timeout
        local start_time=$(date +%s)
        while true; do
            # Check if message ID appears in the agent's pane (indicating it was received)
            if tmux capture-pane -t "$session" -p | grep -q "$msg_id"; then
                echo "✓ Delivered to ${agent}: $msg_id"
                return 0
            fi

            # Check timeout
            local elapsed=$(($(date +%s) - start_time))
            [ $elapsed -gt $timeout ] && break
            sleep ${NOLAN_MSG_POLL_INTERVAL}
        done

        # Timeout - check if stuck (prompt ">" or msg_id visible but not submitted)
        if tmux capture-pane -t "$session" -p | grep -qE "^>|^${msg_id}"; then
            echo "  ! Forcing submit with C-m"
            sleep 0.1
            tmux send-keys -t "$session" C-m
            sleep 0.5
            if tmux capture-pane -t "$session" -p | grep -q "$msg_id"; then
                echo "✓ Delivered to ${agent} after force-submit: $msg_id"
                return 0
            fi
        fi

        # Retry entire message
        attempt=$((attempt + 1))
    done

    echo "✗ Timeout: Failed to deliver to ${agent} after $((retry_count + 1)) attempts"
    return 1
}

# ===== DELIVERY CHECK (manual verification) =====
# Usage: check-delivery ana "MSG_12345678"
# Usage: check-delivery ana-2 "MSG_12345678"

check-delivery() {
    local agent="$1"
    local msg_id="$2"
    local session="agent-${agent}"

    if [ -z "$msg_id" ]; then
        echo "Usage: check-delivery <agent> <msg_id>"
        echo "Example: check-delivery ana MSG_12345678"
        echo "Example: check-delivery ana-2 MSG_12345678"
        return 1
    fi

    if ! agent_exists "$agent"; then
        echo "✗ Error: Agent '${agent}' not found"
        return 1
    fi

    if tmux capture-pane -t "$session" -p | grep -q "$msg_id"; then
        echo "✓ Message found in ${agent}'s pane: $msg_id"
        return 0
    else
        echo "✗ Message NOT found in ${agent}'s pane: $msg_id"
        return 1
    fi
}

# ===== RESEND HELPER =====
# Usage: resend-with-force ana "message"
# Usage: resend-with-force ana-2 "message"
# Sends message, if not confirmed after 2s, sends C-m again to force submit

resend-with-force() {
    local agent="$1"
    local message="$2"
    local session="agent-${agent}"

    if ! agent_exists "$agent"; then
        echo "✗ Error: Agent '${agent}' not found. Use 'list_agents' to see active agents."
        return 1
    fi

    echo "Sending to ${agent}..."
    tmux send-keys -t "$session" -l "$message"
    sleep 0.05
    tmux send-keys -t "$session" C-m

    sleep 2

    # Check if it appears to be processing
    if tmux capture-pane -t "$session" -p | grep -qE "Working|Thinking|Doing|Processing|Calculating"; then
        echo "✓ Message appears to be processing"
        return 0
    elif tmux capture-pane -t "$session" -p | grep -q "^>"; then
        echo "! Message in input state, forcing submit with extra C-m"
        sleep 0.1
        tmux send-keys -t "$session" C-m
        sleep 0.5
        if tmux capture-pane -t "$session" -p | grep -qE "Working|Thinking|Doing|Processing|Calculating"; then
            echo "✓ Message now processing after force-submit"
            return 0
        else
            echo "✗ Message may not have submitted"
            return 1
        fi
    fi
}

# ===== SHOW AGENT PANE (for debugging) =====
# Usage: show-agent ana [lines]
# Usage: show-agent ana-2 [lines]
# Shows last N lines of an agent's pane

show-agent() {
    local agent="$1"
    local lines="${2:-30}"
    local session="agent-${agent}"

    if ! agent_exists "$agent"; then
        echo "✗ Error: Agent '${agent}' not found. Use 'list_agents' to see active agents."
        return 1
    fi

    echo "=== Agent: ${agent} (last ${lines} lines) ==="
    tmux capture-pane -t "$session" -p -S "-${lines}"
}

# ===== DYNAMIC FUNCTION BUILDERS =====
# Creates verified communication functions for all agents
# ALL communication is verified with message IDs and delivery confirmation

# Build dynamic functions for discovered agents
# This allows: ana_verify "msg" 10, ana_2_verify "msg" 10, etc.
# Note: For spawned instances (ana-2, ana-3), use underscores in function names (ana_2, ana_3)
_build_agent_functions() {
    local sessions=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E '^agent-[a-z]+(-[0-9]+)?$' | sort)

    for session in $sessions; do
        local agent_name=$(get_agent_name "$session")

        # Convert hyphens to underscores for function names (bash doesn't allow hyphens)
        # ana-2 becomes ana_2, bill-3 becomes bill_3
        local func_name="${agent_name//-/_}"

        # Create ONLY verified function (e.g., ana_verify, ana_2_verify)
        # This ensures ALL communication is ID-tracked and delivery-confirmed
        # Usage: ana_verify "message" [timeout_seconds]
        eval "${func_name}() { send_verified '${agent_name}' \"\$@\"; }"
    done
}

# Build functions once on source
_build_agent_functions

# Optionally rebuild functions if needed (call this if agents appear after sourcing)
rebuild_aliases() {
    echo "Rebuilding agent aliases..."
    _build_agent_functions
    echo "✓ Aliases rebuilt"
    list_agents
}

# ===== TEAM BROADCAST =====
# Send verified message to all core agents (not spawned instances)
team() {
    local message="$@"
    local count=0

    # Get list of core agent sessions only (no numbers at the end)
    local core_agents=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E '^agent-[a-z]+$' | sort)

    if [ -z "$core_agents" ]; then
        echo "No core agent sessions found"
        return 1
    fi

    for session in $core_agents; do
        local agent_name=$(get_agent_name "$session")
        send_verified "$agent_name" "$message"
        ((count++))
    done

    echo "→ Verified broadcast to core team ($count agents): $message"
}

# Send verified message to ALL active agents (core + spawned)
all() {
    local message="$@"
    local count=0

    local agents=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E '^agent-[a-z]+(-[0-9]+)?$' | sort)

    if [ -z "$agents" ]; then
        echo "No agent sessions found"
        return 1
    fi

    for session in $agents; do
        local agent_name=$(get_agent_name "$session")
        send_verified "$agent_name" "$message"
        ((count++))
    done

    echo "→ Verified broadcast to ALL agents ($count total): $message"
}

# ===== HELP =====
help_aliases() {
    cat <<'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║                    AGENT COMMUNICATION COMMANDS                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

DYNAMIC AGENT DISCOVERY
  list_agents                  Show all active agent sessions
  rebuild_aliases              Rebuild functions (if agents appear after sourcing)

VERIFIED SEND (with message ID tracking and delivery confirmation)
  <agent> "message" [timeout]   Send with verified delivery
    Example: ana "Hello" 5
    Example: ana_2 "Message to spawned instance" 10  (note: underscore not hyphen)

BROADCAST (all verified with IDs)
  team "message"                Send verified message to all core agents (ana, bill, carl, dan, enzo, ralph)
  all "message"                 Send verified message to ALL active agents (core + spawned)

DEBUGGING
  show-agent <agent> [lines]    Display agent's pane (last N lines)
    Example: show-agent ana 50
    Example: show-agent ana-2 30

  check-delivery <agent> <msg_id>   Verify message ID is in pane
    Example: check-delivery ana MSG_12345678

  resend-with-force <agent> "message"   Send and force-submit if stuck
    Example: resend-with-force ana "Stuck message"

EXAMPLES
  ✓ Send verified message to core agent:
    ana "Please start research on authentication" 10

  ✓ Send verified message to spawned agent:
    ana_2 "Status update for investigation #2" 10

  ✓ Broadcast verified message to team:
    team "HANDOFF: Research complete"

  ✓ Broadcast to all agents:
    all "Meeting in 5 minutes"

  ✓ Check agent's pane:
    show-agent bill 100

  ✓ Verify a message was delivered:
    check-delivery ana MSG_12345678

EOF
}

# Print available agents on sourcing (optional - comment out if you prefer quiet)
# list_agents 2>/dev/null || true
