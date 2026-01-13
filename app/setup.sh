#!/usr/bin/env bash
set -e

echo "========================================="
echo "  Nolan Setup"
echo "========================================="
echo ""

# Detect Nolan app root (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NOLAN_APP_ROOT="$SCRIPT_DIR"

echo "Detected Nolan app root: $NOLAN_APP_ROOT"
echo ""

# Verify critical directories exist
echo "Verifying directory structure..."
MISSING_DIRS=()
for dir in agents scripts .claude src src-tauri; do
    if [ ! -d "$NOLAN_APP_ROOT/$dir" ]; then
        MISSING_DIRS+=("$dir")
    fi
done

if [ ${#MISSING_DIRS[@]} -gt 0 ]; then
    echo "ERROR: Required directories not found:"
    for dir in "${MISSING_DIRS[@]}"; do
        echo "  - $dir"
    done
    exit 1
fi

echo "✓ All required directories present"
echo ""

# Determine data root (NOLAN_DATA_ROOT or default to ~/.nolan)
NOLAN_DATA_ROOT="${NOLAN_DATA_ROOT:-$HOME/.nolan}"
echo "Data directory: $NOLAN_DATA_ROOT"
echo ""

# Check runtime dependencies
echo "Checking runtime dependencies..."
MISSING_DEPS=()

if ! command -v tmux &> /dev/null; then
    MISSING_DEPS+=("tmux (required for agent sessions)")
fi

if ! command -v git &> /dev/null; then
    MISSING_DEPS+=("git (required)")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "WARNING: Missing dependencies:"
    for dep in "${MISSING_DEPS[@]}"; do
        echo "  - $dep"
    done
    echo ""
    echo "Nolan may not function correctly without these."
    echo ""
fi

# Verify/create data directories
REPO_ROOT="$(dirname "$NOLAN_APP_ROOT")"
if [ ! -d "$NOLAN_DATA_ROOT/projects" ]; then
    echo "Creating projects directory: $NOLAN_DATA_ROOT/projects"
    mkdir -p "$NOLAN_DATA_ROOT/projects"
fi

# Create teams directory with new structure: teams/{team_name}/team.yaml and agents/
if [ ! -d "$NOLAN_DATA_ROOT/teams" ]; then
    echo "Creating teams directory: $NOLAN_DATA_ROOT/teams"
    mkdir -p "$NOLAN_DATA_ROOT/teams"
fi

# Create default team folder with new structure
if [ ! -d "$NOLAN_DATA_ROOT/teams/default" ]; then
    echo "Creating default team: $NOLAN_DATA_ROOT/teams/default"
    mkdir -p "$NOLAN_DATA_ROOT/teams/default/agents"
    # Copy default team config if it exists (new location)
    if [ -f "$REPO_ROOT/teams/default.yaml" ]; then
        cp "$REPO_ROOT/teams/default.yaml" "$NOLAN_DATA_ROOT/teams/default/team.yaml"
        echo "  Copied default team configuration to teams/default/team.yaml"
    fi
fi

# Migrate existing old-format teams to new format
# Check for .yaml files directly in teams/ (old format)
for old_team in "$NOLAN_DATA_ROOT/teams"/*.yaml; do
    if [ -f "$old_team" ]; then
        team_name=$(basename "$old_team" .yaml)
        if [ "$team_name" != "departments" ] && [ ! -d "$NOLAN_DATA_ROOT/teams/$team_name" ]; then
            echo "Migrating team '$team_name' to new format..."
            mkdir -p "$NOLAN_DATA_ROOT/teams/$team_name/agents"
            mv "$old_team" "$NOLAN_DATA_ROOT/teams/$team_name/team.yaml"
            echo "  Moved $team_name.yaml -> $team_name/team.yaml"
        fi
    fi
done

if [ ! -d "$NOLAN_DATA_ROOT/.state" ]; then
    echo "Creating state directory: $NOLAN_DATA_ROOT/.state"
    mkdir -p "$NOLAN_DATA_ROOT/.state"
fi

# Shared agents directory for Ralph and predefined templates
if [ ! -d "$NOLAN_DATA_ROOT/agents" ]; then
    echo "Creating shared agents directory: $NOLAN_DATA_ROOT/agents"
    mkdir -p "$NOLAN_DATA_ROOT/agents"
fi

if [ ! -d "$NOLAN_DATA_ROOT/reports" ]; then
    echo "Creating reports directory: $NOLAN_DATA_ROOT/reports"
    mkdir -p "$NOLAN_DATA_ROOT/reports"
fi

# Create default UI config if it doesn't exist
if [ ! -f "$NOLAN_DATA_ROOT/config.yaml" ]; then
    echo "Creating UI configuration: $NOLAN_DATA_ROOT/config.yaml"
    cat > "$NOLAN_DATA_ROOT/config.yaml" << 'EOF'
# Nolan UI Configuration
# Customize status labels, colors, and display options
# Changes take effect on app reload

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
EOF
    echo "  ✓ UI configuration created"
fi

echo "✓ Data directories configured at: $NOLAN_DATA_ROOT"
echo ""

# Create symlinks for .claude settings in agent directories
echo "Setting up Claude settings inheritance..."
if [ -d "$NOLAN_APP_ROOT/.claude" ]; then
    AGENTS_DIR="$NOLAN_DATA_ROOT/agents"
    if [ -d "$AGENTS_DIR" ]; then
        for agent_dir in "$AGENTS_DIR"/*; do
            if [ -d "$agent_dir" ]; then
                agent_name=$(basename "$agent_dir")

                # Skip ephemeral agent directories (agent-{name} format)
                # These are created at spawn time by the Rust backend
                if [[ "$agent_name" =~ ^agent- ]]; then
                    continue
                fi

                agent_claude_link="$agent_dir/.claude"

                # Remove existing symlink if it exists
                if [ -L "$agent_claude_link" ]; then
                    rm "$agent_claude_link"
                fi

                # Skip if there's a directory instead
                if [ -d "$agent_claude_link" ]; then
                    echo "  ⚠ Skipping $agent_name: .claude directory exists (not a symlink)"
                else
                    # Create the symlink
                    ln -s "$NOLAN_APP_ROOT/.claude" "$agent_claude_link"
                    echo "  ✓ Created/updated symlink: $agent_name/.claude"
                fi
            fi
        done
    fi
    # Ensure all hook scripts have execute permissions
    if [ -d "$NOLAN_APP_ROOT/.claude/hooks" ]; then
        echo "  Setting execute permissions on hook scripts..."
        chmod +x "$NOLAN_APP_ROOT/.claude/hooks"/*.sh 2>/dev/null || true
        chmod +x "$NOLAN_APP_ROOT/.claude/hooks"/*.py 2>/dev/null || true
        echo "  ✓ Hook permissions updated"
    fi

    echo "✓ Claude settings inheritance configured"
else
    echo "⚠ .claude directory not found at $NOLAN_APP_ROOT/.claude"
fi
echo ""

# Success summary
echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "Nolan app root:  $NOLAN_APP_ROOT"
echo "Nolan data root: $NOLAN_DATA_ROOT"
echo ""
echo "Data directories:"
echo "  Projects:       $NOLAN_DATA_ROOT/projects"
echo "  Teams:          $NOLAN_DATA_ROOT/teams/{team}/team.yaml"
echo "  Team Agents:    $NOLAN_DATA_ROOT/teams/{team}/agents/"
echo "  Shared Agents:  $NOLAN_DATA_ROOT/agents (Ralph, templates)"
echo "  State:          $NOLAN_DATA_ROOT/.state"
echo ""
echo "To launch Nolan:"
echo "  cd $NOLAN_APP_ROOT"
echo "  ./start.sh"
echo ""
