# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Nolan Agent Team

Team of 5 agents with Scrum Master coordination. Product Owner involved only on escalation.

## Roles

| Role | Agent | Model | Output |
|------|-------|-------|--------|
| Product Owner | (Human) | - | Approvals, decisions |
| Project Manager | Dan | sonnet | NOTES.md |
| Research | Ana | sonnet | research.md |
| TechLead | Bill | sonnet | plan.md |
| QA | Enzo | sonnet | qa-review.md |
| Developer | Carl | sonnet | progress.md |

## Workflow

All communication routes through Dan (Scrum Master):

```
Ana ──┐
Bill ─┼──→ Dan ──→ (PO only when escalation needed)
Carl ─┤
Enzo ─┘
```

### Standard Flow
```
1. Dan assigns Ana to research
2. Ana completes research.md → reports to Dan
3. Dan reviews → assigns Bill to plan
4. Bill completes plan.md → reports to Dan
5. Dan reviews → assigns Enzo to QA
6. Enzo completes qa-review.md → reports to Dan
7. Dan reviews → assigns Carl to implement (or Bill to fix if QA issues)
8. Carl completes progress.md → reports to Dan
9. Dan reviews → assigns Enzo to QA
10. Enzo completes qa-review.md → reports to Dan
11. Dan reviews → Done (or Carl to fix if QA issues)
```


## Phase Gates

1. Agent completes output file
2. Agent notifies Dan
3. Dan reviews, updates NOTES.md
4. Dan assigns next phase or escalates to PO if needed

## Escalation

Dan escalates to Product Owner when:
- Requirements unclear
- Scope changes needed
- Blockers require decisions
- Output misaligns with objectives

## Pre-Work Requirements

Before ANY agent assignment, Dan ensures:

1. **context.md** - Project objectives, scope, constraints

## Project Directory

All project files live in the projects directory:

```
DOCS_PATH=$PROJECTS_DIR/<project-name>
```

Where `$PROJECTS_DIR` is set by launch scripts to `$NOLAN_ROOT/projects`.

**CRITICAL:** NEVER create files in agent directories. ALL output goes to `$DOCS_PATH`.

## Files

| File | Location | Purpose |
|------|----------|---------|
| context.md | $DOCS_PATH | Project overview (everyone reads) |
| research.md | $DOCS_PATH[/component] | Ana's findings |
| plan.md | $DOCS_PATH[/component] | Bill's implementation plan |
| qa-review.md | $DOCS_PATH[/component] | Enzo's QA findings |
| progress.md | $DOCS_PATH[/component] | Carl's implementation status |
| NOTES.md | $DOCS_PATH | Dan's coordination hub |

## Handoff Protocol (STANDARDIZED)

### Receiving Assignments

Agents receive assignments via:
1. **Minimal message**: Just the project name (e.g., "nolan-native-terminal")
2. **Full context**: Via SessionStart hook reading `## Current Assignment` section from NOTES.md

**What you see on session start:**
- Project status summary
- Current Assignment section with:
  - Task description
  - Files to review
  - Focus areas
  - Expected output

**Your job:**
1. Read the Current Assignment section (auto-displayed)
2. Review listed files in project directory
3. Complete work in your output file (research.md, plan.md, qa-review.md, or progress.md)
4. Handoff is automatic when you finish (Stop hook triggers)

### Completing Work

Ensure your output file has all required sections:
- **Ana**: research.md with ## Problem, ## Findings, ## Recommendations
- **Bill**: plan.md with ## Overview, ## Tasks, ## Risks
- **Enzo**: qa-review.md with ## Summary, ## Findings, ## Recommendation
- **Carl**: progress.md with ## Status, ## Changes

**Automatic handoff:** When you stop (Ctrl+D or /stop), the Stop hook validates your output and automatically:
1. Adds handoff marker to your file
2. Sends message to Dan
3. Clears your active project state

## Message IDs - Format and Ownership

**CRITICAL:** Message IDs are **only** for verifying message delivery between agents. They have **NO project tracking value**.

### Format: `MSG_<SENDER>_<ID>`

Message IDs include sender identity for auditability:
- `MSG_USER_abc12345` - Sent from Nolan app (human user)
- `MSG_DAN_abc12345` - Sent from Dan (handoffs/assignments)
- `MSG_ANA_abc12345` - Sent from Ana
- `MSG_BILL_abc12345` - Sent from Bill
- `MSG_CARL_abc12345` - Sent from Carl
- `MSG_ENZO_abc12345` - Sent from Enzo
- `MSG_RALPH_abc12345` - Sent from Ralph

The sender prefix allows tracking who initiated each message in live views and logs.

**ALLOWED locations in NOTES.md:**
- Handoff Log table: `| Assigned (MSG_DAN_abc12345) |`
- Current Assignment: `**Assigned**: YYYY-MM-DD (MSG_DAN_abc12345)`

**NEVER**:
- Include "Assignment Marker" language in messages to agents
- Document MSG_IDs in other project files (context.md, research.md, plan.md, qa-review.md, progress.md)
- Reference MSG_IDs in log entries, status updates, or other sections
- Tell agents to track or note MSG_IDs in their output files

**Dan** is responsible for updating the Current Assignment section when assigning work.

## Agent Environment
The `AGENT_NAME` environment variable is automatically set by the Tauri GUI when launching agents. This variable is used by validation hooks to identify the active agent.

This is used by validation hooks to determine required output sections.
## QA Review Protocol

**When:** After each plan.md (Bill) or progress.md (Carl)

**Who:** Enzo

**Trigger:** Dan notifies Enzo when output ready

**Checklist:**
- [ ] Code executes (syntax, dependencies)
- [ ] Paths resolve ($HOME not ~, interpreters specified)
- [ ] Security (no injection, secrets, proper escaping)
- [ ] Integration with existing codebase

**Output:** `qa-review.md` in same location as reviewed file

**Gate:** Critical/High issues block handoff. Medium can proceed with tracking.

### QA Severity Levels

| Severity | Definition | Action |
|----------|------------|--------|
| Critical | Won't execute at all | Block until fixed |
| High | Security risk or major bug | Block until fixed |
| Medium | Works but has issues | Proceed, track for fix |
| Low | Style/improvement | Optional fix |

---

# Development Guide

## Project Overview

**Nolan** is a Tauri-based desktop application that serves as an AI agent control panel and management system. It provides a GUI for monitoring, launching, and coordinating AI agents, with live output streaming, project management, session history, and usage tracking.

### Architecture

The application is split into two main parts:

1. **Frontend** (React + Vite): `/src/` - A React 19 SPA with Tauri API integration
   - Component-based UI with Radix UI and Tailwind CSS
   - State management via Zustand stores
   - Real-time event streaming from backend
   - Tauri IPC for backend communication

2. **Backend** (Rust + Tauri): `/src-tauri/src/` - Async Rust application handling core logic
   - Tmux session management for running agents
   - Python RPC service for transcript processing
   - Command execution and shell interaction
   - File I/O and project management

### Key Directories

```
src/
├── components/    - React components organized by feature (Status, Projects, Live, Usage)
├── hooks/         - Custom React hooks (useSessions, usePaginatedSessions, useWorkflowStatus)
├── store/         - Zustand stores (agentStore, historyStore, liveOutputStore, toastStore)
├── types/         - TypeScript type definitions (projects, sessions, usage)
├── lib/           - Utilities (queryClient, theme, utils, workflowStatus)
└── App.tsx        - Main app with tab-based navigation

src-tauri/src/
├── commands/      - Tauri invoke handlers (lifecycle, communicator, history, sessions, projects, usage)
├── services/      - Business logic (Python service integration)
├── shell/         - Shell command execution
├── tmux/          - Tmux session and terminal management
├── utils/         - Path utilities and helpers
└── lib.rs         - Backend entry point and command registration
```

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

## Code Structure Patterns

### Frontend

**Component Organization**: Features are grouped in `/components/` with subdirectories for each feature area:
- `Status/` - Agent dashboard and system status
- `Projects/` - Project file browsing and management
- `Live/` - Real-time output streaming
- `Usage/` - Cost and usage analytics
- `shared/` - Common reusable components (Toast, AppErrorBoundary, BrandHeader, etc.)
- `ui/` - Low-level UI primitives (buttons, modals, etc.)

**State Management**: Zustand stores in `/store/` handle global state:
- `agentStore` - Active agent and session state
- `historyStore` - Historical entries cache
- `liveOutputStore` - Real-time output from active agents
- `toastStore` - Toast notifications

**Tauri Integration**: Backend communication via `invoke()` from `@tauri-apps/api/core`:
- Commands are defined in Rust backend and exposed through IPC
- Use React Query (`@tanstack/react-query`) for async state and caching
- Event listeners via `listen()` for real-time data (history entries, etc.)

**Styling**: Tailwind CSS with custom theme configuration:
- CSS variables for colors in `tailwind.config.js`
- Agent identity colors defined (Ana/purple, Bill/blue, Carl/indigo, Dan/violet, Enzo/pink, Ralph/zinc)
- Status colors for health indicators (online/offline/warning/degraded)
- Dark mode support via theme provider in `/lib/theme.tsx`

### Backend

**Command Handlers** in `/commands/`:
- `lifecycle.rs` - Agent spawning, termination, and status
- `communicator.rs` - Inter-agent messaging
- `history.rs` - Session history streaming and querying
- `sessions.rs` - Session CRUD and export
- `projects.rs` - Project file access and roadmap management
- `usage.rs` - Cost and usage statistics

**Async Runtime**: Uses Tokio for async operations:
- All I/O operations are async (file, shell, tmux)
- Python service runs in background as async subprocess

**Tmux Management** in `/tmux/`:
- Session creation, targeting, and signal handling
- Window management for agent terminals
- Shell command execution within sessions

**Error Handling**: Custom error types in `error.rs`:
- `AppError` wraps various error categories
- Serializable JSON responses to frontend

## Configuration & Environment

### TypeScript Path Alias
- `@/*` → `/src/*` (use `@/components/...` instead of `../../../components/...`)

### Tauri Configuration
- Fixed dev port: `1420`
- HMR port (hot module reload): `1421`
- Frontend built to `dist/` during Tauri builds

### Theme System
- Default theme: dark mode
- Stored in localStorage under `nolan-ui-theme`
- CSS variables for theming in `App.css`

### Python Service
- Location: defined by `get_transcript_service_dir()` in `src-tauri/src/utils/paths.rs`
- Script: `run.py` in service directory
- Requires `setup.sh` to initialize

## Key Development Workflows

### Adding a New UI Tab/Page

1. Create component in `/src/components/<Feature>/`
2. Add type definitions to `/src/types/`
3. Add Zustand store if needed in `/src/store/`
4. Register tab in `App.tsx` (tabs array and switch case)
5. Add Tauri backend handlers if needed in `/src-tauri/src/commands/`

### Adding a Backend Command

1. Define async function in `/src-tauri/src/commands/<module>.rs`
2. Add to `invoke_handler` in `src-tauri/src/lib.rs`
3. Export from `commands/mod.rs`
4. Call from frontend using `invoke('command_name', { params })`

### Real-Time Updates

- Backend emits events via `app.emit()`
- Frontend listens with `listen<T>('event-name', callback)`
- History entries stream via `history-entry` event
- Add event listeners in component `useEffect` cleanup

### Session Management

- Sessions stored in Tmux (not in-memory)
- Session state tracked in `agentStore` on frontend
- History loaded via `load_history_entries()` or streaming
- Sessions paginated via `get_sessions_paginated()` for performance

## Common Gotchas

1. **Path Handling**: Use absolute paths or functions from `src-tauri/src/utils/paths.rs`. Relative paths differ between dev and release builds.

2. **Async Rust**: All I/O in Tauri commands must be async. Use `.await` for operations.

3. **Serialization**: Structs communicated via Tauri must derive `serde::Serialize` and `serde::Deserialize`.

4. **Frontend Types**: TypeScript types are separate from Rust structs. Keep them in sync manually or use codegen tools.

5. **Event Listening**: Remember to clean up listeners (returned function from `listen()`) in component unmount to prevent memory leaks.

6. **Python Service**: Backend will exit with error message if Python service fails to initialize. Check `setup.sh` was run.

7. **Terminal Handling**: Tmux session termination is asynchronous. Verify sessions via `list_sessions()` after killing.

## Testing & Debugging

### Frontend
- Use browser DevTools in Tauri window (right-click → Inspect)
- Check console for Tauri IPC errors
- React Query DevTools integrated (check usable in dev mode)

### Backend
- Rust compiler strict: `strict: true` in tsconfig.json
- Use `RUST_BACKTRACE=1` for detailed panic traces
- Cargo check for early error detection

### Live Monitoring
- Use the Status tab to monitor agent status in real-time
- Live tab shows stdout/stderr from active sessions
- Check session history for command execution logs
