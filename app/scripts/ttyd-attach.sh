#!/bin/bash
# ttyd session attach script for Nolan
# Attaches to tmux session passed via ?arg=session_name
# Security: No shell access - connection closes if session unavailable

SESSION="$1"

if [ -z "$SESSION" ]; then
    echo "Error: No session specified"
    exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach-session -t "$SESSION"
else
    echo "Session '$SESSION' not found"
    exit 1
fi
