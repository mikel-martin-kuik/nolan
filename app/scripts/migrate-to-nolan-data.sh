#!/bin/bash
# Migrate Nolan data from repo to ~/.nolan
# Run this once after updating to the new data separation architecture

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the repo root (parent of app/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_ROOT="$HOME/.nolan"

echo "Nolan Data Migration Script"
echo "==========================="
echo ""
echo "Source (repo):  $REPO_ROOT"
echo "Target (data):  $DATA_ROOT"
echo ""

# Check if target already has data
if [ -d "$DATA_ROOT" ] && [ "$(ls -A "$DATA_ROOT" 2>/dev/null)" ]; then
    echo -e "${YELLOW}Warning: $DATA_ROOT already exists and is not empty${NC}"
    echo "Contents:"
    ls -la "$DATA_ROOT"
    echo ""
    read -p "Continue and merge? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Create target directory
mkdir -p "$DATA_ROOT"

# Function to move directory
move_dir() {
    local src="$1"
    local dest="$2"
    local name="$3"

    if [ -d "$src" ]; then
        if [ -d "$dest" ]; then
            echo -e "${YELLOW}Merging $name (target exists)${NC}"
            # Use rsync to merge, preserving existing files
            rsync -av "$src/" "$dest/"
            rm -rf "$src"
        else
            echo -e "${GREEN}Moving $name${NC}"
            mv "$src" "$dest"
        fi
    else
        echo -e "${YELLOW}Skipping $name (not found in repo)${NC}"
    fi
}

# Move data directories
echo ""
echo "Moving data directories..."
echo ""

# agents/ - agent working directories (in app/agents/)
move_dir "$REPO_ROOT/app/agents" "$DATA_ROOT/agents" "agents/"

# projects/ - user projects
move_dir "$REPO_ROOT/projects" "$DATA_ROOT/projects" "projects/"

# teams/ - team configurations
move_dir "$REPO_ROOT/teams" "$DATA_ROOT/teams" "teams/"

# .state/ - application state
move_dir "$REPO_ROOT/.state" "$DATA_ROOT/.state" ".state/"

# cronos/runs/ - cron execution logs (NOT cronos/agents/)
if [ -d "$REPO_ROOT/cronos/runs" ]; then
    mkdir -p "$DATA_ROOT/cronos"
    move_dir "$REPO_ROOT/cronos/runs" "$DATA_ROOT/cronos/runs" "cronos/runs/"
fi

echo ""
echo -e "${GREEN}Migration complete!${NC}"
echo ""
echo "Data is now in: $DATA_ROOT"
echo ""
echo "The following directories remain in the repo (source code):"
echo "  - app/src/           (frontend)"
echo "  - app/src-tauri/     (backend)"
echo "  - app/scripts/       (shell scripts)"
echo "  - cronos/agents/     (cron agent definitions)"
echo "  - docs/              (documentation)"
echo ""
echo "You can now restart Nolan - it will automatically use ~/.nolan for data."
