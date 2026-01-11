#!/bin/bash
# Launch ralph-debug with Chrome DevTools integration
# Usage: ./start-debug.sh [optional query]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -n "$1" ]; then
    exec claude --dangerously-skip-permissions --chrome "$@"
else
    exec claude --dangerously-skip-permissions --chrome
fi
