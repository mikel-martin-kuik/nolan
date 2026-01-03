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

# Generate terminator_config from template
if [ -f "$NOLAN_APP_ROOT/terminator_config.template" ]; then
    echo "Generating terminator_config..."
    # Use awk instead of sed - safer with special characters (|, &, \, etc.)
    awk -v root="$NOLAN_APP_ROOT" '{gsub(/{{NOLAN_APP_ROOT}}/, root)}1' \
        "$NOLAN_APP_ROOT/terminator_config.template" \
        > "$NOLAN_APP_ROOT/terminator_config"
    echo "✓ terminator_config generated at:"
    echo "  $NOLAN_APP_ROOT/terminator_config"
else
    echo "ERROR: terminator_config.template not found"
    echo "Expected at: $NOLAN_APP_ROOT/terminator_config.template"
    exit 1
fi

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
