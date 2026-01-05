#!/usr/bin/env bash
# start.sh - Launch Nolan GUI Control Panel

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUI_BINARY="$SCRIPT_DIR/src-tauri/target/release/nolan"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nolan - Agent Control Panel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

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

    # Set NOLAN_ROOT environment variable for the GUI process
    export NOLAN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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

launch_dev() {
    echo "Launching GUI in development mode..."
    echo ""

    # Set NOLAN_ROOT environment variable for the dev process
    export NOLAN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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
