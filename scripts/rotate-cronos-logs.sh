#!/bin/bash
# rotate-cronos-logs.sh - Clean up old cronos run logs
# Usage: ./scripts/rotate-cronos-logs.sh [retention_days]

RETENTION_DAYS=${1:-7}
CRONOS_RUNS_DIR="cronos/runs"

if [ ! -d "$CRONOS_RUNS_DIR" ]; then
    echo "Error: $CRONOS_RUNS_DIR not found"
    exit 1
fi

echo "Cleaning logs older than $RETENTION_DAYS days..."

# Find and delete old directories
deleted_count=0
while IFS= read -r -d '' dir; do
    if [ -d "$dir" ]; then
        echo "Deleting: $dir"
        rm -rf "$dir"
        ((deleted_count++))
    fi
done < <(find "$CRONOS_RUNS_DIR" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -name "2*" -print0)

echo "Deleted $deleted_count directories"
