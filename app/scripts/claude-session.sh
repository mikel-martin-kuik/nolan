#!/bin/bash
# claude-session.sh - Runs Claude and kills tmux session on exit
# This prevents users from /exit'ing Claude and getting shell access
#
# Usage: tmux new-session -s <name> /path/to/claude-session.sh [claude args...]

# Get the current tmux session name
SESSION_NAME=$(tmux display-message -p '#S' 2>/dev/null)

# Function to kill this session
cleanup() {
    if [ -n "$SESSION_NAME" ]; then
        # Small delay to let any final output flush
        sleep 0.5
        tmux kill-session -t "$SESSION_NAME" 2>/dev/null
    fi
}

# Kill session on any exit (normal, error, signal)
trap cleanup EXIT

# Run Claude with all passed arguments
claude "$@"

# If we get here, Claude exited - cleanup trap will kill the session
