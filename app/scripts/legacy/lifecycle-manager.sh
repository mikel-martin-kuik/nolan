#!/bin/bash
# lifecycle-manager.sh - Interactive lifecycle manager session for agent lifecycle

# No strict error handling - UI must stay alive
set -uo pipefail

DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
source "$DIR/../spawn-agent.sh"
set +e
source "$DIR/ui-common.sh"


lifecycle-ui() {
    draw_agent_status "AGENT LIFECYCLE" "🧬"

    echo "  CORE TEAM"
    echo "  • Control:   launch-core | kill-core"
    echo ""
    echo "  INSTANCES"
    echo "  • Manage:    spawn <agent> | kill <name> | kill-all <agent>"
    echo "  • Quick:     ralph (Spawns Haiku Q&A bot)"
    echo ""
    echo "  SYSTEM"
    echo "  • General:   shutdown | help"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

show-help() {
    cat <<EOF

Lifecycle Manager Commands:
===================

spawn <agent> [--force]
  Spawn new agent instance (ana, bill, carl, dan, enzo)
  Opens terminal window attached to session
  --force: Override max instance limit
  Example: spawn bill
           spawn carl --force

  kill <session-name>
  Kill specific agent session (accepts short alias)
  Example: kill bill2

  kill-all <agent>
  Kill all spawned instances of an agent
  Example: kill-all bill

  kill-core
  Kill all core team members (Ana, Bill, Carl, Dan, Enzo)

  launch-core
  Launch/Restart any missing core team members

  ralph
  Spawn a quick Q&A bot (Ralph) using Haiku model


shutdown [-f|--force]
  Shutdown entire team
  -f: Force shutdown without confirmation
  Kills: spawned instances, original agents, communicator, lifecycle manager
  Resets all counters

help
  Show this help

exit, quit
  Exit lifecycle manager

EOF
}

lifecycle-loop() {
    # Prevent script exit
    trap 'echo ""; echo "⚡ IMMORTAL - Use shutdown to kill"; sleep 1' INT TERM

    # Infinite loop - never break except on shutdown
    while true; do
        lifecycle-ui

        # Read with -e for readline, -p for prompt so up/down arrows work
        read -e -r -p "LIFECYCLE> " input || {
            echo ""
            echo "⚡ EOF detected - session cannot exit"
            sleep 1
            continue
        }

        if [[ -n "$input" ]]; then
            history -s "$input"
        fi

        # Parse into cmd, args, rest
        read -r cmd args rest <<< "$input"

        case "$cmd" in
            spawn)
                if [[ -z "$args" ]]; then
                    echo "Error: Agent name required (ana, bill, carl, dan, enzo)"
                    sleep 2
                    continue
                fi
                spawn "$args" $rest || true
                sleep 2
                ;;
            kill)
                if [[ -z "$args" ]]; then
                    echo "Error: Session name required"
                    sleep 2
                    continue
                fi
                kill-instance "$args" || true
                sleep 2
                ;;
            kill-all)
                if [[ -z "$args" ]]; then
                    echo "Error: Agent name required"
                    sleep 2
                    continue
                fi
                kill-instances "$args" || true
                sleep 2
                ;;
            kill-core)
                read -p "Kill core team (Ana, Bill, Carl, Dan, Enzo)? (y/N) " confirm
                if [[ "${confirm,,}" == "y" ]]; then
                    echo "Killing core team..."
                    for agent in ana bill carl dan enzo ralph; do
                        tmux kill-session -t "agent-${agent}" 2>/dev/null && echo "  ✓ ${agent^}" || echo "  ✗ ${agent^} (offline)"
                    done
                    sleep 2
                fi
                ;;
            launch-core)
                echo "Launching core team..."
                "$DIR/../launch-core.sh"
                sleep 2
                ;;
            ralph)
                echo "Spawning Ralph (Haiku)..."
                spawn "ralph" || true
                sleep 2
                ;;
            shutdown)
                local force=false
                if [[ "$args" == "-f" || "$args" == "--force" ]]; then
                    force=true
                fi

                local confirm=""
                if [[ "$force" == "true" ]]; then
                    confirm="y"
                else
                    read -p "Shutdown entire team? (y/N) " confirm
                fi

                if [[ "${confirm,,}" == "y" ]]; then
                    shutdown-team
                    echo "Team shutdown complete. Exiting..."
                    sleep 2
                    # Force exit after shutdown
                    exec exit 0
                fi
                ;;
            help|h)
                show-help
                read -p "Press Enter to continue..."
                ;;
            exit|quit|q|detach)
                echo ""
                echo "⚡ IMMORTAL SESSION - Cannot exit or detach"
                echo "Window will reopen if closed"
                echo "Only 'shutdown' can kill this session"
                echo ""
                sleep 2
                ;;
            "")
                # Empty command, just refresh
                ;;
            *)
                echo "Unknown command: $cmd (type 'help' for commands)"
                sleep 2
                ;;
        esac
    done
}

# CLI interface
case "${1:-}" in
    --ui)
        lifecycle-loop
        ;;
    *)
        echo "Lifecycle Manager is launched automatically with launch-team.sh"
        echo "To attach manually: tmux attach -t lifecycle"
        ;;
esac
