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

# Verify projects directory at repo root
REPO_ROOT="$(dirname "$NOLAN_APP_ROOT")"
if [ ! -d "$REPO_ROOT/projects" ]; then
    echo "WARNING: projects/ directory not found"
    echo "Creating: $REPO_ROOT/projects"
    mkdir -p "$REPO_ROOT/projects"
fi

echo "✓ Projects directory: $REPO_ROOT/projects"
echo ""

# Create symlinks for .claude settings in agent directories
echo "Setting up Claude settings inheritance..."
if [ -d "$NOLAN_APP_ROOT/.claude" ]; then
    AGENTS_DIR="$NOLAN_APP_ROOT/agents"
    if [ -d "$AGENTS_DIR" ]; then
        # Clean up any leftover ephemeral agent directories (alphanumeric IDs with digits)
        for ephemeral_dir in "$AGENTS_DIR"/agent-*; do
            if [ -d "$ephemeral_dir" ]; then
                agent_name=$(basename "$ephemeral_dir")
                # Only delete if it matches ephemeral pattern (contains digits)
                if [[ "$agent_name" =~ ^agent-[a-z0-9]*[0-9][a-z0-9]*$ ]]; then
                    echo "  🗑 Cleaning up leftover ephemeral directory: $agent_name"
                    rm -rf "$ephemeral_dir"
                fi
            fi
        done

        for agent_dir in "$AGENTS_DIR"/*; do
            if [ -d "$agent_dir" ]; then
                agent_name=$(basename "$agent_dir")

                # Skip ephemeral agent directories (alphanumeric IDs with digits)
                if [[ "$agent_name" =~ ^agent-[a-z0-9]*[0-9][a-z0-9]*$ ]]; then
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
echo "Nolan app root:     $NOLAN_APP_ROOT"
echo "Projects directory: $REPO_ROOT/projects"
echo ""
echo "To launch Nolan:"
echo "  cd $NOLAN_APP_ROOT"
echo "  ./start.sh"
echo ""
