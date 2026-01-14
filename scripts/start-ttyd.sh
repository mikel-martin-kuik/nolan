#!/bin/bash
# Start ttyd for Nolan local development
# This script starts the web terminal server on port 7681
#
# Prerequisites:
#   - Install ttyd: sudo apt install ttyd (Ubuntu/Debian)
#                   brew install ttyd (macOS)
#
# Usage:
#   ./scripts/start-ttyd.sh
#   ./scripts/start-ttyd.sh 8080  # Custom port

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-7681}"

# Check if ttyd is installed
if ! command -v ttyd &> /dev/null; then
    echo "Error: ttyd is not installed."
    echo ""
    echo "Install with:"
    echo "  Ubuntu/Debian: sudo apt install ttyd"
    echo "  macOS:         brew install ttyd"
    echo "  Arch:          sudo pacman -S ttyd"
    echo ""
    exit 1
fi

# Check if port is in use (try multiple methods)
PORT_IN_USE=false
if command -v lsof &> /dev/null && lsof -i ":$PORT" &> /dev/null; then
    PORT_IN_USE=true
elif command -v ss &> /dev/null && ss -tln | grep -q ":$PORT "; then
    PORT_IN_USE=true
elif command -v netstat &> /dev/null && netstat -tln | grep -q ":$PORT "; then
    PORT_IN_USE=true
fi

if [ "$PORT_IN_USE" = true ]; then
    echo "Error: Port $PORT is already in use."
    echo ""
    # Try to show what's using it
    if command -v lsof &> /dev/null; then
        echo "Process using port $PORT:"
        lsof -i ":$PORT" 2>/dev/null | head -5
    fi
    echo ""
    echo "Options:"
    echo "  1. Kill the existing process"
    echo "  2. Use a different port: $0 7682"
    echo ""
    exit 1
fi

echo "========================================"
echo "  Starting Nolan Web Terminal (ttyd)"
echo "========================================"
echo ""
echo "Port: $PORT"
echo "URL:  http://localhost:$PORT"
echo ""
echo "To connect to an agent session:"
echo "  http://localhost:$PORT/?arg=agent-default-nova"
echo ""
if [ "$PORT" != "7681" ]; then
    echo "NOTE: Using non-default port. Update ~/.nolan/config.yaml:"
    echo "  ssh_terminal:"
    echo "    enabled: true"
    echo "    base_url: \"http://localhost:$PORT\""
    echo ""
fi
echo "Press Ctrl+C to stop"
echo ""

# Start ttyd
# -p: port
# -W: allow write (bidirectional)
# -a: allow URL arguments (session name passed as ?arg=xxx)
exec ttyd -p "$PORT" -W -a "$SCRIPT_DIR/ttyd-attach.sh"
