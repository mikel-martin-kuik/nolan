#!/usr/bin/env bash
set -e

echo "========================================="
echo "  Nolan Setup"
echo "========================================="
echo ""

# Detect Nolan app root (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOLAN_APP_ROOT="$SCRIPT_DIR"

echo "Detected Nolan app root: $NOLAN_APP_ROOT"
echo ""

# Verify critical directories exist
echo "Verifying directory structure..."
MISSING_DIRS=()
for dir in agents scripts .claude src src-tauri; do
    if [ ! -d "$NOLAN_APP_ROOT/$dir" ]; then
        MISSING_DIRS+=("$dir")
    fi
done

if [ ${#MISSING_DIRS[@]} -gt 0 ]; then
    echo "ERROR: Required directories not found:"
    for dir in "${MISSING_DIRS[@]}"; do
        echo "  - $dir"
    done
    exit 1
fi

echo "✓ All required directories present"
echo ""

# Determine data root (NOLAN_DATA_ROOT or default to ~/.nolan)
NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"
echo "Data directory: $NOLAN_DATA_ROOT"
echo ""

# Check runtime dependencies
echo "Checking runtime dependencies..."
MISSING_DEPS=()

if ! command -v tmux &> /dev/null; then
    MISSING_DEPS+=("tmux (required for agent sessions)")
fi

if ! command -v git &> /dev/null; then
    MISSING_DEPS+=("git (required)")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "WARNING: Missing dependencies:"
    for dep in "${MISSING_DEPS[@]}"; do
        echo "  - $dep"
    done
    echo ""
    echo "Nolan may not function correctly without these."
    echo ""
fi

# Verify/create data directories
REPO_ROOT="$(dirname "$NOLAN_APP_ROOT")"
if [ ! -d "$NOLAN_DATA_ROOT/projects" ]; then
    echo "Creating projects directory: $NOLAN_DATA_ROOT/projects"
    mkdir -p "$NOLAN_DATA_ROOT/projects"
fi

if [ ! -d "$NOLAN_DATA_ROOT/teams" ]; then
    echo "Creating teams directory: $NOLAN_DATA_ROOT/teams"
    mkdir -p "$NOLAN_DATA_ROOT/teams"
    # Copy default team if it exists
    if [ -f "$REPO_ROOT/teams/default.yaml" ]; then
        cp "$REPO_ROOT/teams/default.yaml" "$NOLAN_DATA_ROOT/teams/"
        echo "  Copied default team configuration"
    fi
fi

if [ ! -d "$NOLAN_DATA_ROOT/.state" ]; then
    echo "Creating state directory: $NOLAN_DATA_ROOT/.state"
    mkdir -p "$NOLAN_DATA_ROOT/.state"
fi

if [ ! -d "$NOLAN_DATA_ROOT/agents" ]; then
    echo "Creating agents directory: $NOLAN_DATA_ROOT/agents"
    mkdir -p "$NOLAN_DATA_ROOT/agents"
fi

echo "✓ Data directories configured at: $NOLAN_DATA_ROOT"
echo ""

# Create symlinks for .claude settings in agent directories
echo "Setting up Claude settings inheritance..."
if [ -d "$NOLAN_APP_ROOT/.claude" ]; then
    AGENTS_DIR="$NOLAN_DATA_ROOT/agents"
    if [ -d "$AGENTS_DIR" ]; then
        for agent_dir in "$AGENTS_DIR"/*; do
            if [ -d "$agent_dir" ]; then
                agent_name=$(basename "$agent_dir")

                # Skip ephemeral agent directories (agent-{name} format)
                # These are created at spawn time by the Rust backend
                if [[ "$agent_name" =~ ^agent- ]]; then
                    continue
                fi

                agent_claude_link="$agent_dir/.claude"

                # Remove existing symlink if it exists
                if [ -L "$agent_claude_link" ]; then
                    rm "$agent_claude_link"
                fi

                # Skip if there's a directory instead
                if [ -d "$agent_claude_link" ]; then
                    echo "  ⚠ Skipping $agent_name: .claude directory exists (not a symlink)"
                else
                    # Create the symlink
                    ln -s "$NOLAN_APP_ROOT/.claude" "$agent_claude_link"
                    echo "  ✓ Created/updated symlink: $agent_name/.claude"
                fi
            fi
        done
    fi
    # Ensure all hook scripts have execute permissions
    if [ -d "$NOLAN_APP_ROOT/.claude/hooks" ]; then
        echo "  Setting execute permissions on hook scripts..."
        chmod +x "$NOLAN_APP_ROOT/.claude/hooks"/*.sh 2>/dev/null || true
        chmod +x "$NOLAN_APP_ROOT/.claude/hooks"/*.py 2>/dev/null || true
        echo "  ✓ Hook permissions updated"
    fi

    echo "✓ Claude settings inheritance configured"
else
    echo "⚠ .claude directory not found at $NOLAN_APP_ROOT/.claude"
fi
echo ""

# Success summary
echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "Nolan app root:  $NOLAN_APP_ROOT"
echo "Nolan data root: $NOLAN_DATA_ROOT"
echo ""
echo "Data directories:"
echo "  Projects: $NOLAN_DATA_ROOT/projects"
echo "  Teams:    $NOLAN_DATA_ROOT/teams"
echo "  Agents:   $NOLAN_DATA_ROOT/agents"
echo "  State:    $NOLAN_DATA_ROOT/.state"
echo ""
echo "To launch Nolan:"
echo "  cd $NOLAN_APP_ROOT"
echo "  ./start.sh"
echo ""
