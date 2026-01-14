#!/bin/bash
# Nolan Server Docker Entrypoint
# Initializes data directories before starting the server

set -e

echo "========================================="
echo "  Nolan Server - Docker Entrypoint"
echo "========================================="

# Data root directory (can be overridden via environment)
NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"
export NOLAN_DATA_ROOT

# App root (nolan_root is parent of this)
NOLAN_APP_ROOT="${NOLAN_APP_ROOT:-/nolan/app}"
export NOLAN_APP_ROOT

# Derive nolan_root (parent of app root) for cronos
NOLAN_ROOT="$(dirname "$NOLAN_APP_ROOT")"

echo "Data root: $NOLAN_DATA_ROOT"
echo "App root:  $NOLAN_APP_ROOT"
echo "Nolan root: $NOLAN_ROOT"

# Create app directory structure (for cronos source definitions)
echo "Initializing app directories..."
mkdir -p "$NOLAN_APP_ROOT"
mkdir -p "$NOLAN_ROOT/cronos/agents"
echo "  Created: $NOLAN_ROOT/cronos/agents"

# Create required data directories
echo "Initializing data directories..."

directories=(
    "$NOLAN_DATA_ROOT/projects"
    "$NOLAN_DATA_ROOT/teams"
    "$NOLAN_DATA_ROOT/agents"
    "$NOLAN_DATA_ROOT/reports"
    "$NOLAN_DATA_ROOT/.state"
    "$NOLAN_DATA_ROOT/.state/scheduler"
    "$NOLAN_DATA_ROOT/.state/handoffs"
    "$NOLAN_DATA_ROOT/.state/feedback"
    "$NOLAN_DATA_ROOT/cronos"
    "$NOLAN_DATA_ROOT/cronos/runs"
)

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        echo "  Created: $dir"
    fi
done

echo "✓ Data directories ready"

# Create default team config if none exists
if [ ! -f "$NOLAN_DATA_ROOT/teams/default.yaml" ]; then
    echo "Creating default team configuration..."
    cat > "$NOLAN_DATA_ROOT/teams/default.yaml" << 'EOF'
name: default
description: Default team configuration
agents: []
EOF
    echo "✓ Default team config created"
fi

# Create default UI config if none exists
if [ ! -f "$NOLAN_DATA_ROOT/config.yaml" ]; then
    echo "Creating UI configuration..."
    cat > "$NOLAN_DATA_ROOT/config.yaml" << 'EOF'
# Nolan UI Configuration
# Customize status labels, colors, and display options

project_statuses:
  - value: inprogress
    label: "In Progress"
    color: "text-blue-500"
  - value: pending
    label: "Pending"
    color: "text-yellow-500"
  - value: delegated
    label: "Delegated"
    color: "text-purple-500"
  - value: complete
    label: "Complete"
    color: "text-green-500"
  - value: archived
    label: "Archived"
    color: "text-muted-foreground"

workflow_statuses:
  - value: offline
    label: "Offline"
    color: "bg-muted-foreground/40"
  - value: idle
    label: "Idle"
    color: "bg-zinc-500"
  - value: working
    label: "Working"
    color: "bg-green-500"
  - value: waiting_input
    label: "Needs Input"
    color: "bg-yellow-500"
  - value: blocked
    label: "Blocked"
    color: "bg-red-500"
  - value: ready
    label: "Ready"
    color: "bg-blue-500"
  - value: complete
    label: "Complete"
    color: "bg-teal-500"

feature_request_statuses:
  - value: new
    label: "New"
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20"
  - value: reviewed
    label: "Reviewed"
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
  - value: designed
    label: "Designed"
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20"
  - value: done
    label: "Done"
    color: "bg-green-500/10 text-green-500 border-green-500/20"
  - value: rejected
    label: "Rejected"
    color: "bg-red-500/10 text-red-500 border-red-500/20"

idea_statuses:
  - value: active
    label: "Active"
    color: "text-green-500"
  - value: archived
    label: "Archived"
    color: "text-muted-foreground"

idea_review_statuses:
  - value: draft
    label: "Draft Proposal"
    color: "bg-slate-500/10 text-slate-500 border-slate-500/20"
  - value: needs_input
    label: "Needs Your Input"
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20"
  - value: ready
    label: "Ready"
    color: "bg-green-500/10 text-green-500 border-green-500/20"
  - value: rejected
    label: "Not Feasible"
    color: "bg-red-500/10 text-red-500 border-red-500/20"

idea_complexity_levels:
  - value: low
    label: "Low"
    color: "text-green-500"
  - value: medium
    label: "Medium"
    color: "text-yellow-500"
  - value: high
    label: "High"
    color: "text-red-500"

decision_statuses:
  - value: proposed
    label: "Proposed"
    color: "bg-blue-500/10 text-blue-500 border-blue-500/20"
  - value: in_review
    label: "In Review"
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20"
  - value: approved
    label: "Approved"
    color: "bg-green-500/10 text-green-500 border-green-500/20"
  - value: deprecated
    label: "Deprecated"
    color: "bg-slate-500/10 text-slate-500 border-slate-500/20"
  - value: superseded
    label: "Superseded"
    color: "bg-purple-500/10 text-purple-500 border-purple-500/20"

agent_display_names:
  - name: "Nova"
  - name: "Echo"
  - name: "Pixel"
  - name: "Flux"
  - name: "Spark"
  - name: "Cipher"
  - name: "Orbit"
  - name: "Pulse"
  - name: "Zen"
  - name: "Neon"
  - name: "Apex"
  - name: "Qubit"
  - name: "Atlas"
  - name: "Vega"
  - name: "Cosmo"
  - name: "Drift"
  - name: "Glitch"
  - name: "Helix"
  - name: "Ion"
  - name: "Jade"
  - name: "Kira"
  - name: "Luna"
  - name: "Nebula"
  - name: "Onyx"
  - name: "Phoenix"
  - name: "Quantum"
  - name: "Rune"
  - name: "Sage"
  - name: "Terra"
  - name: "Unity"
  - name: "Volt"
  - name: "Warp"

session_prefixes:
  team: "agent-"
  cron: "cron-"
  predefined: "pred-"

ollama_defaults:
  url: "http://localhost:11434"
  model: "qwen2.5:1.5b"

# SSH Web Terminal (ttyd)
# Provides browser-based terminal access to agent tmux sessions
ssh_terminal:
  enabled: true
  base_url: "http://localhost:7681"
EOF
    echo "✓ UI config created"
fi

# Verify runtime dependencies
echo ""
echo "Checking runtime dependencies..."
deps_ok=true

if ! command -v tmux &> /dev/null; then
    echo "  ✗ tmux not found (required for agent sessions)"
    deps_ok=false
else
    echo "  ✓ tmux"
fi

if ! command -v git &> /dev/null; then
    echo "  ✗ git not found (required for worktrees)"
    deps_ok=false
else
    echo "  ✓ git"
fi

if ! command -v claude &> /dev/null; then
    echo "  ⚠ claude CLI not found (agents won't work without it)"
else
    echo "  ✓ claude CLI"
fi

if [ "$deps_ok" = false ]; then
    echo ""
    echo "WARNING: Some dependencies are missing. Server may not function correctly."
fi

echo ""
echo "========================================="
echo "  Starting Services"
echo "========================================="
echo ""

# Start ttyd (web terminal server) if available
TTYD_PORT="${NOLAN_TTYD_PORT:-7681}"
if command -v ttyd &> /dev/null; then
    echo "Starting ttyd on port $TTYD_PORT..."
    # Create a wrapper script that attaches to the requested tmux session
    # ttyd with -a flag passes URL ?arg=value as positional arguments ($1, $2, etc.)
    cat > /tmp/ttyd-attach.sh << 'TTYD_SCRIPT'
#!/bin/bash
# ttyd session attach script
# Session name passed as first argument via ttyd URL: ?arg=session_name
SESSION="$1"
if [ -z "$SESSION" ]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║              Nolan Web Terminal                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "No session specified. Available tmux sessions:"
    echo ""
    tmux list-sessions 2>/dev/null || echo "  (no active sessions)"
    echo ""
    echo "To connect to a session, use: ?arg=<session_name>"
    echo ""
    exec bash
fi

# Check if session exists
if tmux has-session -t "$SESSION" 2>/dev/null; then
    exec tmux attach-session -t "$SESSION"
else
    echo "Session '$SESSION' not found."
    echo ""
    echo "Available sessions:"
    tmux list-sessions 2>/dev/null || echo "  (no active sessions)"
    echo ""
    exec bash
fi
TTYD_SCRIPT
    chmod +x /tmp/ttyd-attach.sh

    # Start ttyd with URL arg support
    # -p: port, -W: writable, -a: allow URL args as command arguments
    ttyd -p "$TTYD_PORT" -W -a /tmp/ttyd-attach.sh &
    TTYD_PID=$!
    echo "  ✓ ttyd started (PID: $TTYD_PID)"
else
    echo "  ⚠ ttyd not found, web terminal disabled"
fi

echo ""
echo "========================================="
echo "  Starting Nolan Server"
echo "========================================="
echo ""

# Execute the main command (nolan-server binary)
exec "$@"
