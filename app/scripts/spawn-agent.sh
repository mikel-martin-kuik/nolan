#!/bin/bash
# spawn-agent.sh - Spawn additional agent instances at runtime
# Source this file or run directly: spawn-agent.sh spawn <agent>

set -euo pipefail

DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
AGENTS_DIR="$DIR/../agents"
MAX_INSTANCES=5

# Agent model mapping
declare -A MODELS=(
    [ana]=sonnet
    [bill]=sonnet
    [carl]=sonnet
    [dan]=sonnet
    [enzo]=sonnet
    [ralph]=haiku
)

spawn() {
    local agent="${1,,}"
    local force=false
    shift || true

    # Parse options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force|-f) force=true ;;
            *) echo "Unknown option: $1" >&2; return 1 ;;
        esac
        shift
    done

    # Validate agent name
    if [[ ! "$agent" =~ ^(ana|bill|carl|dan|enzo|ralph)$ ]]; then
        echo "Error: Invalid agent '$agent'. Valid: ana, bill, carl, dan, enzo, ralph" >&2
        return 1
    fi

    # Get next instance number from tmux option (defaults to 1 for standalone)
    local next
    if tmux list-sessions &>/dev/null; then
        # Tmux server exists - check for existing instances
        next=$(tmux show-options -gv "@${agent}_next" 2>/dev/null || echo 1)

        # If original agent session exists, start from 2
        if tmux has-session -t "agent-${agent}" 2>/dev/null && [[ "$next" -eq 1 ]]; then
            next=2
        fi
    else
        # No tmux server - first instance
        next=1
    fi

    # Check instance limit (unless --force)
    if [[ "$next" -gt "$MAX_INSTANCES" && "$force" != true ]]; then
        echo "Error: Max instances ($MAX_INSTANCES) reached for $agent." >&2
        echo "Use 'spawn $agent --force' to override." >&2
        return 1
    fi

    local session="agent-${agent}-${next}"
    local agent_dir="$AGENTS_DIR/${agent}"
    local model="${MODELS[$agent]}"

    # Validate agent directory exists
    if [[ ! -d "$agent_dir" ]]; then
        echo "Error: Agent directory not found: $agent_dir" >&2
        return 1
    fi

    # Create new tmux session and start Claude with model and set AGENT_NAME
    local cmd="export AGENT_NAME=$agent; claude --dangerously-skip-permissions --model $model; exec bash"
    tmux new-session -d -s "$session" -c "$agent_dir" "$cmd"

    # Increment counter for next spawn
    tmux set-option -g "@${agent}_next" $((next + 1))

    echo "Spawning: $session..."

    # Generate alias in current shell
    # Note: Use C-m instead of Enter - Enter creates newlines in Claude Code input
    local func_name="${agent}${next}"
    eval "${func_name}() { tmux send-keys -t ${session} -l \"\$*\"; tmux send-keys -t ${session} C-m; }"

    echo "Spawned: $session"
    echo "  Alias: ${func_name}()"

    # Always attach terminal for visual monitoring
    gnome-terminal --title="$session" -- tmux attach -t "$session" &

    # Auto-notify communicator to reload aliases
    if tmux has-session -t communicator 2>/dev/null; then
        # Send reload command to communicator UI
        tmux send-keys -t communicator "reload" Enter
        echo "  Communicator notified to reload aliases"
    fi
}

kill-instance() {
    local session="$1"

    if [[ -z "$session" ]]; then
        echo "Usage: kill-instance <session-name>" >&2
        echo "Example: kill-instance bill2 (or agent-bill-2)" >&2
        return 1
    fi

    # Convert short alias (bill2) to full session name (agent-bill-2)
    if [[ "$session" =~ ^(ana|bill|carl|dan|enzo|ralph)([0-9]+)$ ]]; then
        local agent="${BASH_REMATCH[1]}"
        local instance="${BASH_REMATCH[2]}"
        session="agent-${agent}-${instance}"
    fi

    # Prevent killing original agents
    if [[ "$session" =~ ^agent-(ana|bill|carl|dan|enzo|ralph)$ ]]; then
        echo "Error: Cannot kill original agent. Use kill-instances for spawned only." >&2
        return 1
    fi

    if tmux has-session -t "$session" 2>/dev/null; then
        tmux kill-session -t "$session"
        echo "Killed: $session"

        # Auto-notify communicator to reload aliases
        if tmux has-session -t communicator 2>/dev/null; then
            tmux send-keys -t communicator "reload" Enter
            echo "  Communicator notified to reload aliases"
        fi
    else
        echo "Error: Session not found: $session" >&2
        return 1
    fi
}

kill-instances() {
    local agent="${1,,}"

    if [[ -z "$agent" ]]; then
        echo "Usage: kill-instances <agent>" >&2
        echo "Example: kill-instances bill  (kills bill-2, bill-3, etc.)" >&2
        return 1
    fi

    if [[ ! "$agent" =~ ^(ana|bill|carl|dan|enzo|ralph)$ ]]; then
        echo "Error: Invalid agent '$agent'. Valid: ana, bill, carl, dan, enzo, ralph" >&2
        return 1
    fi

    local killed=0
    while IFS= read -r session; do
        tmux kill-session -t "$session" 2>/dev/null && {
            echo "Killed: $session"
            killed=$((killed + 1))
        }
    done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^agent-${agent}-[0-9]")

    # Reset counter
    tmux set-option -g "@${agent}_next" 2

    if [[ "$killed" -eq 0 ]]; then
        echo "No spawned instances found for: $agent"
    else
        echo "Killed $killed instance(s), counter reset"

        # Auto-notify communicator to reload aliases
        if tmux has-session -t communicator 2>/dev/null; then
            tmux send-keys -t communicator "reload" Enter
            echo "  Communicator notified to reload aliases"
        fi
    fi
}

list-instances() {
    echo "=== Agent Sessions ==="
    echo ""
    echo "Original:"
    tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^agent-(ana|bill|carl|dan|enzo|ralph)$" | sort || echo "  (none)"
    echo ""
    echo "Spawned:"
    tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^agent-(ana|bill|carl|dan|enzo|ralph)-[0-9]+" | sort || echo "  (none)"
    echo ""
    echo "Other:"
    tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -v "^agent-" | sort || echo "  (none)"
}

reload-aliases() {
    echo "Regenerating aliases from active sessions..."

    # Original agents (always available)
    # Note: Use C-m instead of Enter - Enter creates newlines in Claude Code input
    ana()  { tmux send-keys -t agent-ana -l "$*"; tmux send-keys -t agent-ana C-m; }
    bill() { tmux send-keys -t agent-bill -l "$*"; tmux send-keys -t agent-bill C-m; }
    carl() { tmux send-keys -t agent-carl -l "$*"; tmux send-keys -t agent-carl C-m; }
    dan()  { tmux send-keys -t agent-dan -l "$*"; tmux send-keys -t agent-dan C-m; }
    enzo() { tmux send-keys -t agent-enzo -l "$*"; tmux send-keys -t agent-enzo C-m; }
    ralph() { tmux send-keys -t agent-ralph -l "$*"; tmux send-keys -t agent-ralph C-m; }
    team() { ana "$*"; bill "$*"; carl "$*"; dan "$*"; enzo "$*"; }

    # Spawned instances
    local count=0
    while IFS= read -r session; do
        # Extract: agent-bill-2 -> bill, 2
        local suffix="${session#agent-}"
        local agent="${suffix%-*}"
        local instance="${suffix##*-}"
        local func_name="${agent}${instance}"

        eval "${func_name}() { tmux send-keys -t ${session} -l \"\$*\"; tmux send-keys -t ${session} C-m; }"
        echo "  Registered: ${func_name}()"
        count=$((count + 1))
    done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^agent-(ana|bill|carl|dan|enzo|ralph)-[0-9]+" || true)

    echo "Reloaded $count spawned alias(es)"
}

team-all() {
    # Broadcast to ALL agent sessions (original + spawned)
    while IFS= read -r session; do
        tmux send-keys -t "$session" -l "$*"
        tmux send-keys -t "$session" C-m
    done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^agent-")
}

shutdown-team() {
    # Disable error exit for shutdown to ensure complete execution
    set +e

    echo "Shutting down team..."
    echo ""

    # Kill immortal watchdogs first (prevents window reopening)
    echo "Killing watchdogs..."
    pkill -f "immortal-session.sh" 2>/dev/null && echo "  ✓ Watchdogs killed"
    sleep 1

    # Detect current session to kill it last
    local current_session=""
    if [[ -n "${TMUX:-}" ]]; then
        current_session=$(tmux display-message -p '#S')
        echo "Running from: $current_session"
    fi
    echo ""

    # Kill all spawned instances first
    echo "Killing spawned instances..."
    local spawned_killed=0
    while IFS= read -r session; do
        if [[ "$session" != "$current_session" ]]; then
            if tmux kill-session -t "$session" 2>/dev/null; then
                echo "  ✓ $session"
                ((spawned_killed++))
            fi
        fi
    done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^agent-(ana|bill|carl|dan|enzo|ralph)-[0-9]+" || true)
    echo "Spawned killed: $spawned_killed"
    echo ""

    # Kill original agents (in order)
    echo "Killing core agents..."
    local core_killed=0
    for agent in ana bill carl dan enzo ralph; do
        local session="agent-${agent}"
        echo "Checking $session..."
        if [[ "$session" != "$current_session" ]]; then
            if tmux has-session -t "$session" 2>/dev/null; then
                echo "  Killing $session..."
                tmux kill-session -t "$session" 2>/dev/null || true
                echo "  ✓ $session"
                core_killed=$((core_killed + 1))
            else
                echo "  ✗ $session (not found)"
            fi
        else
            echo "  ⊙ $session (current - skip)"
        fi
    done
    # Kill immortal watchdogs first
    echo "Stopping watchdogs..."
    pkill -f "immortal-session.sh" 2>/dev/null || true
    sleep 1

    # Kill all agent sessions
    echo "Killing agent sessions..."
    local core_killed=0
    if tmux has-session -t agent-dan 2>/dev/null; then
        echo "Killing Dan session..."
        tmux kill-session -t agent-dan 2>/dev/null && echo "  ✓ agent-dan"
    fi

    # Kill communicator, history-log and lifecycle sessions
    for session in communicator history-log lifecycle; do
        if [[ "$session" != "$current_session" ]]; then
            if tmux has-session -t "$session" 2>/dev/null; then
                echo "Killing $session session..."
                tmux kill-session -t "$session" 2>/dev/null && echo "  ✓ $session"
            fi
        fi
    done

    # Reset counters
    echo ""
    echo "Resetting counters..."
    for agent in ana bill carl dan enzo ralph; do
        tmux set-option -g -u "@${agent}_next" 2>/dev/null || true
    done

    echo ""
    echo "Closing windows..."
    # Kill terminals attached to our specific sessions
    pkill -f "tmux attach -t communicator" 2>/dev/null && echo "  ✓ Communicator window closed"
    pkill -f "tmux attach -t history-log" 2>/dev/null && echo "  ✓ History Log window closed"
    pkill -f "tmux attach -t lifecycle" 2>/dev/null && echo "  ✓ Lifecycle window closed"
    pkill -f "tmux attach -t agent-dan" 2>/dev/null && echo "  ✓ Dan window closed"
    pkill -f "terminator --maximize --layout=team" 2>/dev/null && echo "  ✓ Core Team Grid (Terminator) closed"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Shutdown complete"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Re-enable error exit
    set -e

    # Kill current session last if it's communicator or lifecycle
    if [[ "$current_session" == "communicator" || "$current_session" == "lifecycle" ]]; then
        echo ""
        echo "Killing current session ($current_session) in 2 seconds..."
        sleep 2
        tmux kill-session -t "$current_session" 2>/dev/null || true
    fi
}

# CLI interface when executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    case "${1:-}" in
        spawn)
            shift
            spawn "$@"
            ;;
        kill-instance)
            shift
            kill-instance "$@"
            ;;
        kill-instances)
            shift
            kill-instances "$@"
            ;;
        list|list-instances)
            list-instances
            ;;
        reload|reload-aliases)
            reload-aliases
            ;;
        shutdown|shutdown-team)
            shutdown-team
            ;;
        *)
            echo "Usage: spawn-agent.sh <command> [args]"
            echo ""
            echo "Commands:"
            echo "  spawn <agent> [--force]   Spawn new instance (ana|bill|carl|dan|enzo)"
            echo "                            Always opens attached terminal"
            echo "  kill-instance <session>   Kill specific spawned instance"
            echo "  kill-instances <agent>    Kill all spawned instances of agent"
            echo "  list-instances            List all agent sessions"
            echo "  reload-aliases            Regenerate aliases from active sessions"
            echo "  shutdown-team             Shutdown all agents, communicator, and lifecycle"
            echo ""
            echo "Or source this file: source spawn-agent.sh"
            ;;
    esac
fi
