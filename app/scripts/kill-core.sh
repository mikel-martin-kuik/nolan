#!/bin/bash
# kill-core.sh - Kills the core agent team sessions (Ana, Bill, Carl, Dan, Enzo)
# Does NOT kill spawned instances (agent-{name}2, etc) or infrastructure sessions

set -euo pipefail

CORE_AGENTS=("ana" "bill" "carl" "dan" "enzo")

echo "Terminating Core Team Sessions..."

for agent in "${CORE_AGENTS[@]}"; do
    session="agent-$agent"

    if tmux has-session -t "$session" 2>/dev/null; then
        echo "  - Killing ${agent^} session ($session)..."
        tmux kill-session -t "$session"
    else
        echo "  - ${agent^} session not active."
    fi
done

echo "Core team sessions terminated."
echo "Note: Spawned instances (agent-*2, agent-*3, etc.) remain active."
