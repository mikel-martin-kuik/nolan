#!/bin/bash
# Fix tmux session sizes for Nolan agents
# Clears any window-size overrides that prevent responsive resizing

echo "Clearing window-size overrides on agent sessions..."
echo ""

for session in $(tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^agent-"); do
    echo "  $session"
    tmux set-window-option -t "=$session" -u window-size 2>/dev/null
done

echo ""
echo "Done. Reattach to sessions to apply."
