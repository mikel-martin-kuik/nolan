#!/bin/bash
# immortal-session.sh - Watchdog that keeps controller/HR windows always open

SESSION_NAME="$1"
TITLE="$2"

if [[ -z "$SESSION_NAME" || -z "$TITLE" ]]; then
    echo "Usage: immortal-session.sh <session-name> <window-title>"
    exit 1
fi

echo "[$(date)] Watchdog started for $SESSION_NAME"

# Monitor loop - reopen window if terminal closes
while tmux has-session -t "$SESSION_NAME" 2>/dev/null; do
    attached=$(tmux list-clients -t "$SESSION_NAME" 2>/dev/null | wc -l)

    if [[ "$attached" -eq 0 ]]; then
        echo "[$(date)] Reopening $TITLE - session detached"
        gnome-terminal --title="$TITLE" -- tmux attach -t "$SESSION_NAME" &
        sleep 2
    fi

    sleep 3
done

echo "[$(date)] Session $SESSION_NAME terminated - watchdog exiting"
