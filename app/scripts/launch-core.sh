#!/bin/bash
# launch-core.sh - Launches the core agent team (Ana, Bill, Carl, Dan, Enzo)

# Calculate repo root and standard paths ONCE
DIR="$(dirname "$(readlink -f "$0")")"
NOLAN_ROOT="$(readlink -f "$DIR/../..")"
PROJECTS_DIR="$NOLAN_ROOT/projects"

# Function to start a core agent session if it doesn't exist
start_agent_session() {
    local name=$1
    local model=$2
    local session="agent-$name"
    local agent_dir="$NOLAN_ROOT/app/agents/$name"

    if tmux has-session -t "$session" 2>/dev/null; then
        echo "  - ${name^} session already active."
    else
        echo "  - Starting ${name^} session..."
        # Launching with the command string directly prevents command echoing in tmux history
        # 'exec bash' at the end ensures the session stays open if Claude exits
        local cmd="export AGENT_NAME=$name NOLAN_ROOT=\"$NOLAN_ROOT\" PROJECTS_DIR=\"$PROJECTS_DIR\" AGENT_DIR=\"$agent_dir\"; claude --dangerously-skip-permissions --model $model; exec bash"
        tmux new-session -d -s "$session" -c "$agent_dir" "$cmd"

        # Initialize instance counter for spawning additional instances
        tmux set-option -g "@${name}_next" 2
    fi
}

echo "Initializing Core Team Sessions..."

# 1. Start all sessions in background
# -------------------------------------------------------
start_agent_session "dan" "sonnet"
start_agent_session "ana" "sonnet"
start_agent_session "bill" "sonnet"
start_agent_session "carl" "sonnet"
start_agent_session "enzo" "sonnet"

# 2. Open standalone window for Dan (Scrum Master)
# -------------------------------------------------------
if ! pgrep -f "tmux attach -t agent-dan" >/dev/null; then
    gnome-terminal --title="Dan (Scrum Master)" -- tmux attach -t "agent-dan"
fi

# 3. Launch Core Team Grid (Ana, Bill, Carl, Enzo)
# -------------------------------------------------------
if ! pgrep -f "terminator --maximize --layout=team" > /dev/null; then
    echo "Launching Core Team Grid (Terminator)..."
    # Terminator layout attaches to the sessions started above
    terminator --maximize --layout=team &
else
    echo "Core Team Grid already active."
fi

echo "Core team launch initiated."

# Reload Communicator to register new agents
if tmux has-session -t communicator 2>/dev/null; then
    echo "Reloading Communicator..."
    tmux send-keys -t communicator "reload" Enter
fi
