#!/bin/bash
#
# SubagentStop hook: Validates subagent work quality.
#
# Exit codes:
#   0 - Success (JSON output with decision)
#
# Input (stdin): JSON with subagent_type, result
# Output (stdout): JSON with decision

set -euo pipefail

# Read JSON input
data=$(cat)

# Extract subagent info
subagent_type=$(echo "$data" | jq -r '.subagent_type // empty')
result=$(echo "$data" | jq -r '.result // empty')

# Default minimum line counts by subagent type
declare -A min_lines
min_lines["Explore"]=5
min_lines["Plan"]=10
min_lines["general-purpose"]=3

# Get minimum for this subagent type (default 3 if empty or unknown)
if [[ -n "$subagent_type" && -v "min_lines[$subagent_type]" ]]; then
    min=${min_lines[$subagent_type]}
else
    min=3
fi

# Count result lines
lines=$(echo "$result" | wc -l)

if [[ $lines -lt $min ]]; then
    cat <<EOF
{
  "decision": "block",
  "reason": "Subagent ($subagent_type) output too brief ($lines lines). Minimum: $min lines. Expand analysis."
}
EOF
else
    cat <<EOF
{
  "decision": "approve"
}
EOF
fi
