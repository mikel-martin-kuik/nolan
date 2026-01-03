#!/usr/bin/env bash
# start.sh - Launch Communicator and Lifecycle Manager with UI windows

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$DIR/scripts"
LAUNCH_DIR="$(pwd)"

# Kill any existing watchdogs to avoid duplicates
pkill -f "immortal-session.sh" 2>/dev/null || true

#######################################
# Communicator session
#######################################
if ! tmux has-session -t communicator 2>/dev/null; then
    cmd="bash $SCRIPTS_DIR/communicator-ui.sh --ui; exec bash"
    tmux new-session -d -s communicator -c "$LAUNCH_DIR" "$cmd"
    gnome-terminal --title="📡 Communicator" -- tmux attach -t communicator &
fi

#######################################
# History Log session (separate terminal)
#######################################
if ! tmux has-session -t history-log 2>/dev/null; then
    cmd="bash $SCRIPTS_DIR/tail-history.sh; exec bash"
    tmux new-session -d -s history-log -c "$LAUNCH_DIR" "$cmd"
    gnome-terminal --title="📜 History Log" --geometry=80x30 -- tmux attach -t history-log &
fi

#######################################
# Lifecycle Manager session
#######################################
if ! tmux has-session -t lifecycle 2>/dev/null; then
    cmd="bash $SCRIPTS_DIR/lifecycle-manager.sh --ui; exec bash"
    tmux new-session -d -s lifecycle -c "$DIR" "$cmd"
fi

#######################################
# Launch immortal watchdogs
# Wait for terminals to attach before starting watchdogs
#######################################
sleep 2
"$SCRIPTS_DIR/immortal-session.sh" communicator "📡 Communicator" &
"$SCRIPTS_DIR/immortal-session.sh" history-log "📜 History Log" &
"$SCRIPTS_DIR/immortal-session.sh" lifecycle "🧬 Lifecycle" &

#######################################
# Launch GUI Control Panel
#######################################

echo "=== Support Systems Initialized ==="
echo "📡 Communicator: Online (Immortal Window)"
echo "📜 History Log:  Online (Immortal Window)"
echo "🧬 Lifecycle:    Online (Immortal Window)"
echo ""
echo "Use 'launch-core' in Lifecycle Manager to start agents."
echo ""
echo "Launching GUI Control Panel..."

"$SCRIPTS_DIR/start-gui.sh" --force