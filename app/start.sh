#!/usr/bin/env bash
set -e

# Detect app root directory using portable method
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Nolan from: $DIR"

# Check if setup has been run (required for config generation)
if [ ! -f "$DIR/terminator_config" ]; then
    echo ""
    echo "ERROR: Configuration not generated"
    echo ""
    echo "Please run setup first:"
    echo "  cd $DIR"
    echo "  ./setup.sh"
    echo ""
    exit 1
fi

# Launch UI components using portable relative paths
"$DIR/scripts/communicator-ui.sh" &
"$DIR/scripts/tail-history.sh" &
"$DIR/scripts/lifecycle-manager.sh" &

echo "Nolan UI components launched"
