#!/bin/bash
#
# migrate-to-teams.sh - Assign default team to existing projects
#
# This script ensures all existing projects have a .team file.
# Projects without .team will be assigned the "default" team.
#

set -euo pipefail

NOLAN_ROOT="${NOLAN_ROOT:-$HOME/nolan}"
PROJECTS_DIR="${PROJECTS_DIR:-$NOLAN_ROOT/projects}"

echo "=== Nolan Team Migration ==="
echo "Projects directory: $PROJECTS_DIR"
echo ""

if [[ ! -d "$PROJECTS_DIR" ]]; then
    echo "Error: Projects directory not found: $PROJECTS_DIR"
    exit 1
fi

migrated=0
skipped=0
total=0

# Scan all project directories
for project_dir in "$PROJECTS_DIR"/*/ ; do
    [[ -d "$project_dir" ]] || continue

    project=$(basename "$project_dir")

    # Skip special directories
    if [[ "$project" == _* ]] || [[ "$project" == .* ]]; then
        continue
    fi

    total=$((total + 1))

    team_file="$project_dir/.team"

    if [[ -f "$team_file" ]]; then
        # Parse team name (supports YAML and plain text formats)
        existing_team=$(python3 -c "
import yaml
from pathlib import Path
content = Path('$team_file').read_text()
try:
    data = yaml.safe_load(content)
    if isinstance(data, dict) and 'team' in data:
        print(data['team'])
    else:
        print(content.strip())
except:
    print(content.strip())
" 2>/dev/null || cat "$team_file")
        echo "✓ $project → $existing_team (already configured)"
        skipped=$((skipped + 1))
    else
        echo "default" > "$team_file"
        echo "✓ $project → default (migrated)"
        migrated=$((migrated + 1))
    fi
done

echo ""
echo "=== Migration Complete ==="
echo "Total projects: $total"
echo "Migrated: $migrated"
echo "Already configured: $skipped"

if [[ $migrated -gt 0 ]]; then
    echo ""
    echo "✅ $migrated project(s) assigned to default team"
fi
