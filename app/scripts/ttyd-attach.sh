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
    # Enable aggressive-resize so the session adapts to this terminal's size
    tmux set-window-option -t "=$SESSION" aggressive-resize on 2>/dev/null

    # Force resize to a large size first, then tmux will resize down to fit
    # This clears any "stuck" small size from previous embedded terminals
    tmux resize-window -t "=$SESSION" -x 200 -y 50 2>/dev/null
    tmux resize-window -t "=$SESSION" -A 2>/dev/null

    # Now attach - tmux will resize to match this terminal
    tmux attach-session -t "$SESSION"
    exit 0
else
    echo "Session '$SESSION' not found"
    exit 1
fi
