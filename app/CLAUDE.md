# CLAUDE.md

---

# Development Guide

## Project Overview

**Nolan** is a Tauri-based desktop application that serves as an AI agent control panel and management system. It provides a GUI for monitoring, launching, and coordinating AI agents, with live output streaming, project management, session history, and usage tracking.

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