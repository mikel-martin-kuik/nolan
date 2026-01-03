#!/bin/bash
# ui-common.sh - Shared UI components for agent management tools

draw_agent_status() {
    local title="$1"
    local icon="$2"

    clear
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  $icon $title"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Build status line (Core Team)
    local status_line="Core: "
    for agent in ana bill carl dan enzo; do
        if tmux has-session -t "agent-${agent}" 2>/dev/null; then
            status_line+="✓ ${agent^} "
        else
            status_line+="✗ ${agent^} "
        fi
    done

    # Count spawned
    local spawned_count=0
    while IFS= read -r session; do
        spawned_count=$((spawned_count + 1))
    done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^agent-(ana|bill|carl|dan|enzo|ralph)-[0-9]+" || true)

    status_line+="| Spawned: $spawned_count"

    echo "$status_line"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Show Spawned Instances (Detailed view)
    if [[ "$spawned_count" -gt 0 ]]; then
        echo "Active Instances:"
        while IFS= read -r session; do
            local suffix="${session#agent-}"
            local agent="${suffix%-*}"
            local instance="${suffix##*-}"
            # Format: bill2 (agent-bill-2)
            printf "  • %s%s  (%s)\n" "$agent" "$instance" "$session"
        done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^agent-(ana|bill|carl|dan|enzo|ralph)-[0-9]+" | sort || true)
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    fi
}
