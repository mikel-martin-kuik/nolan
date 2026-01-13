#!/bin/bash
# Nolan Server Docker Entrypoint
# Initializes data directories before starting the server

set -e

echo "========================================="
echo "  Nolan Server - Docker Entrypoint"
echo "========================================="

# Data root directory (can be overridden via environment)
NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"
export NOLAN_DATA_ROOT

# App root (nolan_root is parent of this)
NOLAN_APP_ROOT="${NOLAN_APP_ROOT:-/nolan/app}"
export NOLAN_APP_ROOT

# Derive nolan_root (parent of app root) for cronos
NOLAN_ROOT="$(dirname "$NOLAN_APP_ROOT")"

echo "Data root: $NOLAN_DATA_ROOT"
echo "App root:  $NOLAN_APP_ROOT"
echo "Nolan root: $NOLAN_ROOT"

# Create app directory structure (for cronos source definitions)
echo "Initializing app directories..."
mkdir -p "$NOLAN_APP_ROOT"
mkdir -p "$NOLAN_ROOT/cronos/agents"
echo "  Created: $NOLAN_ROOT/cronos/agents"

# Create required data directories
echo "Initializing data directories..."

directories=(
    "$NOLAN_DATA_ROOT/projects"
    "$NOLAN_DATA_ROOT/teams"
    "$NOLAN_DATA_ROOT/agents"
    "$NOLAN_DATA_ROOT/.state"
    "$NOLAN_DATA_ROOT/.state/scheduler"
    "$NOLAN_DATA_ROOT/.state/handoffs"
    "$NOLAN_DATA_ROOT/.state/feedback"
    "$NOLAN_DATA_ROOT/cronos"
    "$NOLAN_DATA_ROOT/cronos/runs"
)

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo "  Created: $dir"
    fi
done

echo "✓ Data directories ready"

# Create default team config if none exists
if [ ! -f "$NOLAN_DATA_ROOT/teams/default.yaml" ]; then
    echo "Creating default team configuration..."
    cat > "$NOLAN_DATA_ROOT/teams/default.yaml" << 'EOF'
name: default
description: Default team configuration
agents: []
EOF
    echo "✓ Default team config created"
fi

# Verify runtime dependencies
echo ""
echo "Checking runtime dependencies..."
deps_ok=true

if ! command -v tmux &> /dev/null; then
    echo "  ✗ tmux not found (required for agent sessions)"
    deps_ok=false
else
    echo "  ✓ tmux"
fi

if ! command -v git &> /dev/null; then
    echo "  ✗ git not found (required for worktrees)"
    deps_ok=false
else
    echo "  ✓ git"
fi

if ! command -v claude &> /dev/null; then
    echo "  ⚠ claude CLI not found (agents won't work without it)"
else
    echo "  ✓ claude CLI"
fi

if [ "$deps_ok" = false ]; then
    echo ""
    echo "WARNING: Some dependencies are missing. Server may not function correctly."
fi

echo ""
echo "========================================="
echo "  Starting Nolan Server"
echo "========================================="
echo ""

# Execute the main command (nolan-server binary)
exec "$@"
