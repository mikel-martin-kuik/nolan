#!/bin/bash
# start-gui.sh - Launch the GUI Control Panel application

set -euo pipefail

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
PROJECT_ROOT="$SCRIPT_DIR/.."
GUI_DIR="$PROJECT_ROOT"
GUI_BINARY="$GUI_DIR/src-tauri/target/release/nolan"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nolan - GUI Control Panel Launcher"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

check_running() {
    if pgrep -f "nolan" > /dev/null; then
        echo -e "${YELLOW}⚠ GUI Control Panel is already running.${NC}"
        echo ""
        read -p "Kill existing instance and restart? (y/N): " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "Killing existing instance..."
            pkill -f "nolan"
            sleep 1
        else
            echo "Exiting. Use 'pkill -f nolan' to kill manually."
            exit 0
        fi
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
    if ! command -v terminator &> /dev/null; then
        echo -e "${YELLOW}⚠ Warning: terminator not found. Core team grid launching will fail.${NC}"
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

        if [ ! -d "$GUI_DIR" ]; then
            echo -e "${RED}✗ GUI project directory not found: $GUI_DIR${NC}"
            echo "Run vibecode or clone the repository first."
            exit 1
        fi

        cd "$GUI_DIR"

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
            echo "  cd $GUI_DIR"
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

    nohup "$GUI_BINARY" > /tmp/gui-control-panel.log 2>&1 &
    local pid=$!

    sleep 2
    if ps -p $pid > /dev/null; then
        echo -e "${GREEN}✓ GUI Control Panel launched successfully (PID: $pid)${NC}"
        echo ""
        echo "Logs: /tmp/gui-control-panel.log"
        echo "To stop: pkill -f nolan"
    else
        echo -e "${RED}✗ GUI failed to start. Check logs:${NC}"
        echo "  tail /tmp/gui-control-panel.log"
        exit 1
    fi
}

launch_dev() {
    echo "Launching GUI in development mode..."
    echo ""

    cd "$GUI_DIR"

    if [ ! -d "node_modules" ]; then
        echo "Installing npm dependencies..."
        npm install
    fi

    npm run tauri dev
}

main() {
    DEV_MODE=false
    SKIP_CHECK=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dev|-d)
                DEV_MODE=true
                shift
                ;;
            --force|-f)
                SKIP_CHECK=true
                shift
                ;;
            --help|-h)
                echo "Usage: start-gui.sh [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --dev, -d      Launch in development mode (hot reload)"
                echo "  --force, -f    Skip running instance check"
                echo "  --help, -h     Show this help message"
                echo ""
                echo "Examples:"
                echo "  start-gui.sh              # Launch production build"
                echo "  start-gui.sh --dev        # Launch dev mode with hot reload"
                echo "  start-gui.sh --force      # Force restart if already running"
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

    if [ "$SKIP_CHECK" = false ]; then
        check_running
    fi

    if [ "$DEV_MODE" = true ]; then
        launch_dev
    else
        build_if_needed
        launch_gui
    fi

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  GUI Control Panel is ready!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

main "$@"
