#!/bin/bash
# communicator-ui.sh - Interactive communicator for team communication

# No strict error handling - UI must stay alive
set -uo pipefail

DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
source "$DIR/spawn-agent.sh"
set +e
source "$DIR/ui-common.sh"


communicator-ui() {
    draw_agent_status "TEAM COMMUNICATOR" "📡"

    echo "  MESSAGING"
    echo "  • Direct:    ana | bill | carl | dan | enzo  <msg>"
    echo "  • Broadcast: team | all  <msg>"
    echo "  • Spawned:   <alias>  <msg>"
    echo ""
    echo "  SYSTEM"
    echo "  • Controls:  reload | help"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

show-help() {
    cat <<EOF

Team Communicator Commands:
=========================

COMMUNICATION:
--------------
ana <message>
bill <message>
carl <message>
dan <message>
enzo <message>
  Send message to specific core team member
  Example: ana "Start research on authentication system"
           bill "Review the plan for user management"

team <message>
  Broadcast to all core team members (ana, bill, carl, dan, enzo)
  Example: team "Meeting in 5 minutes"

all <message>
  Broadcast to ALL agents (core + spawned instances)
  Example: all "Shutdown prep - save your work"

<alias> <message>
  Send to spawned instance using alias
  Example: bill2 "Check the test results"
           carl3 "Deploy to staging"

MANAGEMENT:
-----------
reload
  Reload aliases for spawned instances

help
  Show this help

EOF
}

parse-command() {
    local input="$1"

    # Extract first word as command, rest as args
    local cmd="${input%% *}"
    local args="${input#* }"

    # If no space, args is same as cmd
    if [[ "$cmd" == "$args" ]]; then
        args=""
    fi

    echo "$cmd|$args"
}

communicator-loop() {
    # Prevent script exit
    trap 'echo ""; echo "⚡ IMMORTAL - Use shutdown-team to kill"; sleep 1' INT TERM

    # Infinite loop - never break
    while true; do
        communicator-ui

        # Read with EOF handling (-e enables readline, -p sets prompt so readline handles it)
        read -e -r -p "CMD> " input || {
            echo ""
            echo "⚡ EOF detected - session cannot exit"
            sleep 1
            continue
        }

        if [[ -z "$input" ]]; then
            continue
        fi

        # Add to history for up-arrow recall
        history -s "$input"

        # Parse command and args
        IFS='|' read -r cmd args <<< "$(parse-command "$input")"

        case "$cmd" in
            ana|bill|carl|dan|enzo|ralph)
                if [[ -z "$args" ]]; then
                    echo "Error: Message required"
                    sleep 1
                    continue
                fi

                if tmux has-session -t "agent-${cmd}" 2>/dev/null; then
                    tmux send-keys -t "agent-${cmd}" -l "$args"
                    tmux send-keys -t "agent-${cmd}" C-m
                    echo "→ Sent to ${cmd^}: $args"
                else
                    echo "Error: ${cmd^} is offline"
                fi
                sleep 1
                ;;
            team)
                if [[ -z "$args" ]]; then
                    echo "Error: Message required"
                    sleep 1
                    continue
                fi

                local sent=0
                for agent in ana bill carl dan enzo; do
                    if tmux has-session -t "agent-${agent}" 2>/dev/null; then
                        tmux send-keys -t "agent-${agent}" -l "$args"
                        tmux send-keys -t "agent-${agent}" C-m
                        sent=$((sent + 1))
                    fi
                done
                echo "→ Broadcast to core team ($sent agents): $args"
                sleep 1
                ;;

            all)
                if [[ -z "$args" ]]; then
                    echo "Error: Message required"
                    sleep 1
                    continue
                fi

                local sent=0
                while IFS= read -r session; do
                    tmux send-keys -t "$session" -l "$args"
                    tmux send-keys -t "$session" C-m
                    sent=$((sent + 1))
                done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^agent-(ana|bill|carl|dan|enzo|ralph)" || true)

                echo "→ Broadcast to ALL agents ($sent total): $args"
                sleep 1
                ;;
            # --- INSERT AFTER all) case (line 158) ---
            broadcast)
    # Usage: broadcast --workers "message"
    #        broadcast --leads "message"
    #        broadcast --exclude dan "message"
    #        broadcast ana,bill "message"

    local targets=""
    local exclude=""
    local msg=""

    # Parse arguments
    case "$args" in
        --workers\ *)
            targets="ana bill carl"
            msg="${args#--workers }"
            ;;
        --leads\ *)
            targets="dan enzo"
            msg="${args#--leads }"
            ;;
        --exclude\ *)
            local rest="${args#--exclude }"
            exclude="${rest%% *}"
            msg="${rest#* }"
            targets="ana bill carl dan enzo"
            ;;
        *)
            # Comma-separated list: broadcast ana,bill "msg"
            local list="${args%% *}"
            msg="${args#* }"
            targets="${list//,/ }"
            ;;
    esac

    if [[ -z "$msg" ]]; then
        echo "Usage: broadcast [--workers|--leads|--exclude <agent>|<list>] <message>"
        echo "  --workers       Ana, Bill, Carl (doers)"
        echo "  --leads         Dan, Enzo (coordinators)"
        echo "  --exclude <a>   All except specified agent"
        echo "  <list>          Comma-separated: ana,bill"
        sleep 2
        continue
    fi

    local sent=0
    for agent in $targets; do
        if [[ "$exclude" == "$agent" ]]; then
            continue
        fi
        if tmux has-session -t "agent-${agent}" 2>/dev/null; then
            tmux send-keys -t "agent-${agent}" -l "$msg"
            tmux send-keys -t "agent-${agent}" C-m
            sent=$((sent + 1))
        fi
    done
    echo "→ Targeted broadcast ($sent agents): $msg"
    sleep 1
    ;;
            ana[2-9]|bill[2-9]|carl[2-9]|dan[2-9]|enzo[2-9]|ralph[1-9]|ana[1-9][0-9]|bill[1-9][0-9]|carl[1-9][0-9]|dan[1-9][0-9]|enzo[1-9][0-9]|ralph[1-9][0-9])
                # Spawned instance alias
                if [[ -z "$args" ]]; then
                    echo "Error: Message required"
                    sleep 1
                    continue
                fi

                # Extract agent and instance number
                local agent_base="${cmd%%[0-9]*}"
                local instance="${cmd#$agent_base}"
                local session="agent-${agent_base}-${instance}"

                if tmux has-session -t "$session" 2>/dev/null; then
                    tmux send-keys -t "$session" -l "$args"
                    tmux send-keys -t "$session" C-m
                    echo "→ Sent to ${cmd}: $args"
                else
                    echo "Error: Session $session not found"
                fi
                sleep 1
                ;;

            lifecycle|life)
                if [[ -z "$args" ]]; then
                    echo "Error: Message/Command required"
                    sleep 1
                    continue
                fi
                if tmux has-session -t lifecycle 2>/dev/null; then
                    tmux send-keys -t lifecycle -l "$args"
                    tmux send-keys -t lifecycle C-m
                    echo "→ Sent to Lifecycle: $args"
                else
                    echo "Error: Lifecycle is offline"
                fi
                sleep 1
                ;;

            reload|reload-aliases)
                echo "Reloading aliases..."
                reload-aliases
                echo "Aliases reloaded"
                sleep 1
                ;;

            help|h)
                show-help
                read -p "Press Enter to continue..."
                ;;
            exit|quit|q|detach)
                echo ""
                echo "⚡ IMMORTAL SESSION - Cannot exit or detach"
                echo "Window will reopen if closed"
                echo "Only 'shutdown-team' can kill this session"
                echo ""
                sleep 2
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
        communicator-loop
        ;;
    *)
        echo "Communicator UI is launched automatically with launch-team.sh"
        echo "To attach manually: tmux attach -t communicator"
        ;;
esac
