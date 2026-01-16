# CLAUDE.md

---

# Development Guide

## AI-Friendly Architecture

**CRITICAL: This codebase is maintained by AI agents. Follow these rules:**

1. **Max file size: 400 lines** - If a file exceeds this, split it before adding more code
2. **Single responsibility** - Each file should have ONE purpose describable in ~10 words
3. **Predictable naming** - Use patterns in `docs/AI_ARCHITECTURE.md`
4. **Flat hierarchies** - Max 2 directory levels for easy navigation

**See `docs/AI_ARCHITECTURE.md` for complete guidelines.**

---

## Project Overview

**Nolan** is a Tauri-based desktop application that serves as an AI manufacturing line orchestrator. It provides a GUI for designing and operating AI agent workflows, where:

- **Humans design the manufacturing line**: Define agents (stations), workflows (flow), and quality gates
- **The line executes automatically**: Scheduler triggers stations, pipeline routes work via output files
- **Agents don't coordinate**: They receive inputs, produce outputs, and the system routes work

Key features: live output streaming, project management, pipeline monitoring, and usage tracking.

## Build & Development Commands

### Full Stack Development

```bash
# Install dependencies
npm install

# Run dev server (frontend) - runs at http://localhost:1420
npm run dev

# Build frontend only
npm run build

# In parallel terminal: Build and run Tauri desktop app
npm run tauri dev     # Hot reloads on frontend changes

# Build release binary
npm run tauri build
```

### Frontend-Only Development

```bash
npm run dev           # Runs Vite dev server (requires mock backend data)
```

### Type Checking

```bash
tsc                   # Check TypeScript in frontend
cd src-tauri && cargo check  # Check Rust backend
```

### Build Diagnostics

- Frontend builds use Vite and output to `dist/`
- Tauri builds Rust backend and bundles the frontend
- Check build output in `src-tauri/target/` for Rust artifacts
- The final binary location: `src-tauri/target/release/nolan`

## Tauri IPC Convention

**CRITICAL: All Tauri invoke calls MUST use snake_case parameter keys.**

The Rust backend uses `#[tauri::command(rename_all = "snake_case")]` on all commands.

```typescript
// ✅ CORRECT - snake_case parameter keys
await invoke('get_team_config', { team_name: 'default' });
await invoke('spawn_agent', { team_name: 'myteam', agent: 'ralph', worktree_path: '/path' });
await invoke('save_agent_metadata', { agent_name: 'myagent', role: 'Developer', model: 'opus' });

// ❌ WRONG - camelCase will cause runtime errors
await invoke('get_team_config', { teamName: 'default' });  // FAILS!
await invoke('spawn_agent', { teamName: 'myteam', worktreePath: '/path' });  // FAILS!
```

### Type-Safe Alternative

Use the typed `invokeCommand` wrapper for compile-time checking:

```typescript
import { invokeCommand } from '@/lib/commands';

// TypeScript will error if you use wrong parameter names
const team = await invokeCommand('get_team_config', { team_name: 'default' });
```

### Common Parameter Mappings

| Rust Parameter | Frontend Key |
|----------------|--------------|
| `team_name`    | `team_name`  |
| `agent_name`   | `agent_name` |
| `old_name`     | `old_name`   |
| `new_name`     | `new_name`   |
| `worktree_path`| `worktree_path` |
| `project_name` | `project_name` |
| `file_path`    | `file_path`  |

---

## Project Structure

```
nolan/
├── app/                    # Tauri application
│   ├── src/                # React frontend (TypeScript)
│   │   ├── components/     # UI components
│   │   ├── hooks/          # React hooks
│   │   ├── lib/            # Utilities, API calls
│   │   └── types/          # TypeScript types
│   └── src-tauri/          # Rust backend
│       ├── src/
│       │   ├── api/        # HTTP API routes
│       │   ├── commands/   # Tauri IPC commands
│       │   ├── scheduler/  # Pipeline & scheduling
│       │   └── events/     # Event bus (experimental)
│       └── templates/      # Agent templates
├── agents/                 # Scheduled agent configs
├── teams/                  # Team YAML configurations
└── docs/                   # Documentation
    ├── architecture/       # System architecture (00-07)
    └── roadmaps/           # Business & product roadmaps
```

**Data location**: `~/.nolan/` (NOLAN_DATA_ROOT)

---

## Key Concepts

| Term | Meaning |
|------|---------|
| **Station** | An agent in the manufacturing line (receives input, produces output) |
| **Pipeline** | Configurable sequence of stations (like CI/CD) |
| **Team Pipeline** | Dynamic phases from team.yaml (execution + validation per phase) |
| **Verdict** | Station output: Complete, Revision, or Failed |
| **Spec** | Natural language specification (Phase 6 - evolving) |

---

## Architecture Docs

For deeper context, see `docs/architecture/`:

| Doc | Topic |
|-----|-------|
| `00-system-overview.md` | Manufacturing line philosophy |
| `01-pipeline-coordination.md` | Agent pipeline (configurable stages) |
| `02-team-pipeline-coordination.md` | Team pipeline (dynamic phases) |
| `05-trigger-system.md` | Cron, event, command, pipeline triggers |
| `06-coordination-comparison.md` | Comparison of orchestration patterns |
| `07-spec-driven-architecture.md` | Spec-driven development (Phase 6) |

---

## Common Tasks

### Add a new Tauri command

1. Add function in `src-tauri/src/commands/{domain}.rs`
2. Add `#[tauri::command(rename_all = "snake_case")]`
3. Register in `src-tauri/src/lib.rs` invoke_handler
4. Add TypeScript types in `src/types/`
5. Call via `invokeCommand()` with snake_case params

### Add a new scheduled agent

1. Create folder in `agents/{agent-name}/`
2. Add `agent.yaml` with trigger config
3. Add `CLAUDE.md` with agent instructions
4. Agent auto-discovered by scheduler

### Add a new team

1. Create folder in `teams/{team-name}/`
2. Add `team.yaml` with workflow phases
3. Add agent configs as needed
4. Team auto-discovered by list_available_teams()