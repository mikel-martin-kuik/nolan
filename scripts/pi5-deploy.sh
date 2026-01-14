#!/bin/bash
# Pi5 Deployment Script for Nolan
# Usage: ./scripts/pi5-deploy.sh <command> [options]

set -e

# Configuration
PI5_HOST="pi5"
LOCAL_SRC="$(dirname "$(dirname "$(realpath "$0")")")"  # nolan repo root
REMOTE_SRC="/root/nolan-build"
REMOTE_DEPLOY="$REMOTE_SRC/deploy"
LOCAL_DATA="$HOME/.nolan"
REMOTE_DATA="/srv/nolan/data"
EXCLUDE_FILE="$LOCAL_DATA/.rsync-exclude"

usage() {
    echo "Pi5 Deployment Script for Nolan"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  push              Sync data ~/.nolan → pi5:/srv/nolan/data"
    echo "  pull              Sync data pi5:/srv/nolan/data → ~/.nolan"
    echo "  deploy            Sync source + rebuild + restart (~30 min)"
    echo "  deploy --no-build Sync source only, skip rebuild"
    echo "  restart           Restart containers on Pi5"
    echo "  status            Show container status"
    echo "  logs              Show container logs (follow)"
    echo "  ssh               SSH into Pi5"
    echo ""
    echo "Paths:"
    echo "  Local source:  $LOCAL_SRC"
    echo "  Pi5 source:    $PI5_HOST:$REMOTE_SRC"
    echo "  Local data:    $LOCAL_DATA"
    echo "  Pi5 data:      $PI5_HOST:$REMOTE_DATA"
}

cmd_push() {
    local dry_run=""
    [[ "$1" == "--dry-run" || "$1" == "-n" ]] && dry_run="-n" && echo "DRY RUN"
    
    echo "Pushing $LOCAL_DATA → $PI5_HOST:$REMOTE_DATA"
    rsync -avz $dry_run --exclude-from="$EXCLUDE_FILE" "$LOCAL_DATA/" "$PI5_HOST:$REMOTE_DATA/"
    echo "Done."
}

cmd_pull() {
    local dry_run=""
    [[ "$1" == "--dry-run" || "$1" == "-n" ]] && dry_run="-n" && echo "DRY RUN"
    
    echo "Pulling $PI5_HOST:$REMOTE_DATA → $LOCAL_DATA"
    rsync -avz $dry_run --exclude-from="$EXCLUDE_FILE" "$PI5_HOST:$REMOTE_DATA/" "$LOCAL_DATA/"
    echo "Done."
}

cmd_deploy() {
    echo "=== Syncing source to Pi5 ==="
    rsync -avz --delete \
        --exclude='target/' \
        --exclude='node_modules/' \
        --exclude='dist/' \
        --exclude='.git/' \
        "$LOCAL_SRC/" "$PI5_HOST:$REMOTE_SRC/"

    if [[ "$1" == "--no-build" ]]; then
        echo "Skipping build (--no-build)"
        return
    fi

    echo ""
    echo "=== Rebuilding Docker image on Pi5 (~30 min) ==="
    ssh "$PI5_HOST" "cd $REMOTE_DEPLOY && docker compose -f docker-compose.pi5.yml build 2>&1 | tee build.log"

    echo ""
    echo "=== Restarting containers ==="
    ssh "$PI5_HOST" "cd $REMOTE_DEPLOY && docker compose -f docker-compose.pi5.yml up -d"

    echo ""
    cmd_status
}

cmd_restart() {
    echo "Restarting Nolan on Pi5..."
    ssh "$PI5_HOST" "cd $REMOTE_DEPLOY && docker compose -f docker-compose.pi5.yml restart"
    cmd_status
}

cmd_status() {
    echo "=== Pi5 Nolan Status ==="
    ssh "$PI5_HOST" "docker compose -f $REMOTE_DEPLOY/docker-compose.pi5.yml ps"
    echo ""
    echo "=== API Health ==="
    ssh "$PI5_HOST" "curl -s http://localhost:3030/api/auth/status" && echo ""
}

cmd_logs() {
    ssh "$PI5_HOST" "docker compose -f $REMOTE_DEPLOY/docker-compose.pi5.yml logs -f"
}

cmd_ssh() {
    ssh "$PI5_HOST"
}

# Main
case "${1:-}" in
    push)    shift; cmd_push "$@" ;;
    pull)    shift; cmd_pull "$@" ;;
    deploy)  shift; cmd_deploy "$@" ;;
    restart) cmd_restart ;;
    status)  cmd_status ;;
    logs)    cmd_logs ;;
    ssh)     cmd_ssh ;;
    -h|--help|"") usage ;;
    *) echo "Unknown command: $1"; usage; exit 1 ;;
esac
