#!/usr/bin/env bash
# start.sh - Launch Nolan GUI Control Panel

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUI_BINARY="$SCRIPT_DIR/src-tauri/target/release/nolan"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# PIDs of services we started (for cleanup)
STARTED_OLLAMA=false
STARTED_TTYD=false
TTYD_PID=""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nolan - Agent Control Panel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cleanup() {
    echo ""
    echo -e "${BLUE}Cleaning up...${NC}"

    # Stop ttyd if we started it
    if [ "$STARTED_TTYD" = true ] && [ -n "$TTYD_PID" ]; then
        if kill -0 "$TTYD_PID" 2>/dev/null; then
            echo "  Stopping ttyd (PID: $TTYD_PID)..."
            kill "$TTYD_PID" 2>/dev/null || true
        fi
    fi

    # Note: We don't stop ollama as other apps might be using it
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# Set up cleanup on exit
trap cleanup EXIT

start_ollama() {
    echo -e "${BLUE}Checking Ollama...${NC}"

    if ! command -v ollama &> /dev/null; then
        echo -e "  ${YELLOW}⚠ ollama not installed (optional - for AI features)${NC}"
        return 0
    fi

    # Check if ollama is already running (fast timeout)
    if curl -s --connect-timeout 1 --max-time 2 http://localhost:11434/api/tags &>/dev/null; then
        echo -e "  ${GREEN}✓ Ollama is already running${NC}"
        return 0
    fi

    # Start ollama serve in background
    echo "  Starting ollama serve..."
    nohup ollama serve > /tmp/ollama.log 2>&1 &
    STARTED_OLLAMA=true

    # Wait for it to be ready (with fast timeouts)
    for i in {1..5}; do
        if curl -s --connect-timeout 1 --max-time 2 http://localhost:11434/api/tags &>/dev/null; then
            echo -e "  ${GREEN}✓ Ollama started${NC}"
            return 0
        fi
        sleep 0.3
    done

    echo -e "  ${YELLOW}⚠ Ollama starting in background${NC}"
}

start_ttyd() {
    echo -e "${BLUE}Checking Web Terminal (ttyd)...${NC}"

    if ! command -v ttyd &> /dev/null; then
        echo -e "  ${YELLOW}⚠ ttyd not installed (run setup.sh to install)${NC}"
        return 0
    fi

    local TTYD_PORT="${NOLAN_TTYD_PORT:-7681}"

    # Check if ttyd is already running on our port (fast timeout)
    if curl -s --connect-timeout 1 --max-time 2 "http://localhost:$TTYD_PORT" &>/dev/null; then
        echo -e "  ${GREEN}✓ ttyd is already running on port $TTYD_PORT${NC}"
        return 0
    fi

    # Check if port is in use by something else
    if command -v ss &> /dev/null && ss -tln | grep -q ":$TTYD_PORT "; then
        echo -e "  ${YELLOW}⚠ Port $TTYD_PORT in use by another process${NC}"
        echo "    Try: NOLAN_TTYD_PORT=7682 ./start.sh"
        return 0
    fi

    # Start ttyd
    local ATTACH_SCRIPT="$SCRIPT_DIR/scripts/ttyd-attach.sh"
    if [ ! -f "$ATTACH_SCRIPT" ]; then
        echo -e "  ${YELLOW}⚠ ttyd-attach.sh not found${NC}"
        return 0
    fi

    echo "  Starting ttyd on port $TTYD_PORT..."
    nohup ttyd -p "$TTYD_PORT" -W -a "$ATTACH_SCRIPT" > /tmp/ttyd.log 2>&1 &
    TTYD_PID=$!
    STARTED_TTYD=true

    # Wait for it to be ready
    sleep 1
    if kill -0 "$TTYD_PID" 2>/dev/null; then
        echo -e "  ${GREEN}✓ ttyd started (PID: $TTYD_PID)${NC}"
        echo -e "  ${BLUE}  Web terminal: http://localhost:$TTYD_PORT${NC}"
    else
        echo -e "  ${YELLOW}⚠ ttyd failed to start (check /tmp/ttyd.log)${NC}"
        STARTED_TTYD=false
        TTYD_PID=""
    fi
}

check_dependencies() {
    local missing=()

    if ! command -v node &> /dev/null; then
        missing+=("node (Node.js)")
    fi
    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    fi
    if ! command -v cargo &> /dev/null; then
        missing+=("cargo (Rust)")
    fi

    if ! command -v gnome-terminal &> /dev/null; then
        echo -e "${YELLOW}⚠ Warning: gnome-terminal not found. Agent terminal launching will fail.${NC}"
    fi

    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}✗ Missing required dependencies:${NC}"
        for dep in "${missing[@]}"; do
            echo "  - $dep"
        done
        echo ""
        echo "Install dependencies and try again."
        exit 1
    fi
}

build_if_needed() {
    if [ ! -f "$GUI_BINARY" ]; then
        echo -e "${YELLOW}GUI binary not found. Building...${NC}"
        echo ""

        cd "$SCRIPT_DIR"

        if [ ! -d "node_modules" ]; then
            echo "Installing npm dependencies..."
            npm install || {
                echo -e "${RED}✗ npm install failed${NC}"
                exit 1
            }
        fi

        echo "Building Tauri application (this may take several minutes)..."
        npm run tauri build || {
            echo -e "${RED}✗ Build failed${NC}"
            echo ""
            echo "Try manual build:"
            echo "  cd $SCRIPT_DIR"
            echo "  npm install"
            echo "  npm run tauri build"
            exit 1
        }

        echo -e "${GREEN}✓ Build complete${NC}"
        echo ""
    fi
}

launch_gui() {
    echo "Launching GUI Control Panel..."
    echo ""

    # Set environment variables for the GUI process
    export NOLAN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    export NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"

    # Start supporting services
    start_services

    nohup "$GUI_BINARY" > /tmp/nolan.log 2>&1 &
    local pid=$!

    sleep 2
    if ps -p $pid > /dev/null; then
        echo -e "${GREEN}✓ Nolan launched successfully (PID: $pid)${NC}"
        echo ""
        echo "Logs: /tmp/nolan.log"
        echo "To stop: pkill -f nolan"
    else
        echo -e "${RED}✗ GUI failed to start. Check logs:${NC}"
        echo "  tail /tmp/nolan.log"
        exit 1
    fi
}

start_services() {
    echo ""
    # Start services in parallel for faster boot
    start_ollama &
    local ollama_pid=$!
    start_ttyd &
    local ttyd_pid=$!

    # Wait for both to complete
    wait $ollama_pid 2>/dev/null
    wait $ttyd_pid 2>/dev/null
    echo ""
}

launch_dev() {
    echo "Launching GUI in development mode..."
    echo ""

    # Set environment variables for the dev process
    export NOLAN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    export NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"

    # Start supporting services
    start_services

    cd "$SCRIPT_DIR"

    if [ ! -d "node_modules" ]; then
        echo "Installing npm dependencies..."
        npm install
    fi

    npm run tauri dev
}

main() {
    DEV_MODE=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dev|-d)
                DEV_MODE=true
                shift
                ;;
            --help|-h)
                echo "Usage: start.sh [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dev, -d      Launch in development mode (hot reload)"
                echo "  --help, -h     Show this help message"
                echo ""
                echo "Examples:"
                echo "  ./start.sh              # Launch production build"
                echo "  ./start.sh --dev        # Launch dev mode with hot reload"
                echo ""
                echo "Environment:"
                echo "  NOLAN_TTYD_PORT    Web terminal port (default: 7681)"
                echo ""
                echo "Services started automatically:"
                echo "  - Ollama (if installed) for AI features"
                echo "  - ttyd (if installed) for web terminal access"
                echo ""
                echo "Note: Single-instance enforcement is automatic."
                echo "      If Nolan is already running, it will be focused."
                exit 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done

    check_dependencies

    if [ "$DEV_MODE" = true ]; then
        launch_dev
    else
        build_if_needed
        launch_gui
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Nolan is ready!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main "$@"
