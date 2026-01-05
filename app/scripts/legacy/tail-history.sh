#!/bin/bash
# tail-history.sh - Tail and format Claude history for the Communicator side-panel

HISTORY_FILE="$HOME/.claude/history.jsonl"

if [[ ! -f "$HISTORY_FILE" ]]; then
    echo "Waiting for history file..."
    until [[ -f "$HISTORY_FILE" ]]; do sleep 1; done
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📜 LIVE INTERACTION LOG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Tail the file and process each line
tail -n 50 -f "$HISTORY_FILE" | while read -r line; do
    # Extract fields using jq
    # Use -R and fromjson to handle potential malformed lines gracefully
    display=$(echo "$line" | jq -r '.display // ""' 2>/dev/null || echo "")
    project=$(echo "$line" | jq -r '.project // "unknown"' 2>/dev/null || echo "unknown")
    
    # Skip noise (internal commands and empty inputs)
    if [[ "$display" =~ ^/usage || "$display" =~ ^/config || "$display" =~ ^/model || -z "$display" || "$display" == "exit" ]]; then
        continue
    fi
    
    # Clean up display text (remove newlines if any)
    display=$(echo "$display" | tr '\n' ' ')
    
    # Get agent name from project path (e.g., .../agents/ana -> ana)
    agent=$(basename "$project")
    [[ "$agent" == "Nolan" ]] && agent="USER"
    
    # Format: [HH:MM:SS] Agent: Message
    timestamp=$(date +"%H:%M:%S")
    
    # Color coding based on agent
    case "$agent" in
        ana)   color="\033[1;35m" ;; # Magenta
        bill)  color="\033[1;33m" ;; # Yellow
        carl)  color="\033[1;36m" ;; # Cyan
        dan)   color="\033[1;32m" ;; # Green
        enzo)  color="\033[1;34m" ;; # Blue
        ralph*) color="\033[1;37m" ;; # White
        USER)  color="\033[1;31m" ;; # Red
        *)     color="\033[1;90m" ;; # Grey
    esac

    printf "\033[90m[%s]\033[0m %b%s\033[0m: %s\n" "$timestamp" "$color" "${agent^}" "$display"
done
