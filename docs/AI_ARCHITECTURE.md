# AI-Friendly Architecture Guidelines

This document defines architectural patterns for maintaining a codebase that AI assistants can effectively navigate, understand, and modify.

## Why AI-Friendly Architecture Matters

AI coding assistants have hard limits:
- **File size limits**: Most tools cap at ~25,000 tokens (~1,500-2,000 lines)
- **Search-based navigation**: AI finds code via glob patterns and grep searches
- **Context window constraints**: Large files consume context budget quickly
- **No IDE indexing**: AI cannot "jump to definition" - it must search

When files exceed these limits, AI cannot:
- Read entire files without pagination
- Understand full component context
- Make confident, safe modifications

---

## Core Rules

### Rule 1: File Size Limits

| File Type | Max Lines | Target Lines |
|-----------|-----------|--------------|
| Rust (.rs) | 400 | 200-300 |
| TypeScript/TSX | 400 | 200-300 |
| Type definitions | 300 | 150-200 |
| Test files | 500 | 300-400 |
| Config files | 200 | 100-150 |

**When a file exceeds the max: SPLIT IT.**

### Rule 2: Single Responsibility

Each file should have ONE clear purpose that can be described in ~10 words:
- `session_validator.rs` - "Validates agent session state and ownership"
- `TeamsList.tsx` - "Renders the list of teams with selection"
- `useTeamModals.ts` - "Manages modal open/close state for teams"

**If you cannot describe the file's purpose in ~10 words, it does too much.**

### Rule 3: Predictable Naming

AI searches use patterns. Use consistent, searchable names:

```
# Rust modules
{domain}/mod.rs           - Module entry point, re-exports
{domain}/types.rs         - Type definitions for domain
{domain}/commands.rs      - Tauri command handlers (thin, delegate to helpers)
{domain}/{action}.rs      - Specific action implementation

# TypeScript components
{Feature}/index.tsx       - Main component (container)
{Feature}/{Feature}List.tsx    - List view
{Feature}/{Feature}Detail.tsx  - Detail view
{Feature}/{Feature}Card.tsx    - Card component
{Feature}/use{Feature}.ts      - Data fetching hook
{Feature}/use{Feature}Actions.ts - Mutation hook
{Feature}/{Feature}.types.ts   - Local types

# Shared code
lib/{domain}.ts           - Domain utilities
lib/{domain}/index.ts     - Domain entry point
hooks/use{Name}.ts        - Reusable hooks
types/{domain}.ts         - Shared types for domain
```

### Rule 4: Shallow Hierarchies

AI navigates via directory listing. Keep hierarchies flat:

```
# Good - 2 levels max
src/commands/
├── agents.rs
├── lifecycle.rs
├── lifecycle_validator.rs
├── lifecycle_parser.rs
└── projects.rs

# Bad - too deep
src/commands/
└── lifecycle/
    └── validation/
        └── session/
            └── validator.rs
```

### Rule 5: Explicit Exports

In module entry points (`mod.rs`, `index.ts`), explicitly list what's exported:

```rust
// scheduler/mod.rs
mod commands;
mod executor;
mod manager;
mod types;

pub use commands::*;
pub use executor::AgentExecutor;
pub use manager::SchedulerManager;
pub use types::{ScheduleConfig, TriggerConfig, AgentRole};
```

```typescript
// components/Teams/index.ts
export { TeamsPanel } from './TeamsPanel';
export { TeamsList } from './TeamsList';
export { TeamDetail } from './TeamDetail';
export { TeamCard } from './TeamCard';
export type { TeamsPanelProps, TeamsListProps } from './Teams.types';
```

---

## Refactoring Patterns

### Pattern A: Extract by Responsibility

When a file does multiple things, split by responsibility:

**Before** (`commands.rs` - 3000 lines):
```rust
// Schedule CRUD
pub fn create_schedule(...) { ... }
pub fn delete_schedule(...) { ... }

// Inbox processing
pub fn process_inbox(...) { ... }
pub fn route_idea(...) { ... }

// Post-run analysis
pub fn trigger_analyzer(...) { ... }
```

**After**:
```
scheduler/
├── commands.rs       (100 lines - thin handlers, delegates)
├── schedule_crud.rs  (300 lines - create/update/delete schedules)
├── inbox_processor.rs (400 lines - inbox review logic)
├── idea_router.rs    (300 lines - routing decisions)
└── analyzer.rs       (200 lines - post-run analysis)
```

### Pattern B: Extract Hooks from Components

When a React component has complex state management:

**Before** (`TeamsPanel.tsx` - 1600 lines):
```tsx
function TeamsPanel() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // ... 25 more useState calls

  // Complex data fetching
  // Event handlers
  // Rendering
}
```

**After**:
```
Teams/
├── TeamsPanel.tsx       (200 lines - composition + layout)
├── TeamsList.tsx        (250 lines - list rendering)
├── TeamDetail.tsx       (300 lines - detail view)
├── useTeamModals.ts     (150 lines - modal state)
├── useTeamActions.ts    (200 lines - mutations)
└── Teams.types.ts       (50 lines - local types)
```

### Pattern C: Extract Types to Dedicated Files

Types scattered across implementation files are hard to find:

**Before** (types mixed in `manager.rs`):
```rust
pub struct SchedulerManager { ... }
pub struct ScheduleConfig { ... }
pub enum AgentRole { ... }
impl SchedulerManager { ... }
```

**After**:
```
scheduler/
├── types.rs    (AgentRole, ScheduleConfig, TriggerConfig)
├── manager.rs  (SchedulerManager struct + impl)
└── mod.rs      (re-exports)
```

### Pattern D: Command Handlers Stay Thin

Tauri command handlers should be thin wrappers that delegate:

**Before** (`lifecycle.rs` - 2400 lines with inline logic):
```rust
#[tauri::command]
pub async fn spawn_agent(...) -> Result<...> {
    // 200 lines of validation
    // 150 lines of session setup
    // 100 lines of process spawning
    // 50 lines of error handling
}
```

**After**:
```rust
// lifecycle.rs (thin handler)
#[tauri::command]
pub async fn spawn_agent(...) -> Result<...> {
    let session = validator::validate_spawn_request(&args)?;
    let agent = spawner::spawn_agent_process(&session).await?;
    Ok(agent)
}

// lifecycle_validator.rs
pub fn validate_spawn_request(args: &SpawnArgs) -> Result<ValidatedSession> { ... }

// lifecycle_spawner.rs
pub async fn spawn_agent_process(session: &ValidatedSession) -> Result<Agent> { ... }
```

---

## Search-Friendly Code

### Use Consistent Markers

Add searchable markers for AI to find important sections:

```rust
// === PUBLIC API ===
pub fn exported_function() { ... }

// === INTERNAL HELPERS ===
fn internal_helper() { ... }

// === TYPES ===
pub struct MyType { ... }
```

### Document Module Purpose

Every module should start with a doc comment explaining its purpose:

```rust
//! scheduler/inbox_processor.rs
//!
//! Handles incoming ideas from the inbox queue.
//! Validates, categorizes, and routes ideas to appropriate agents.
//!
//! Entry point: `process_pending_ideas()`
//! Called by: scheduler cron job (every 5 minutes)
```

```typescript
/**
 * Teams/useTeamModals.ts
 *
 * Manages modal visibility state for the Teams panel.
 * Handles: add team, edit team, delete team, agent config modals.
 *
 * Usage: const { modals, openModal, closeModal } = useTeamModals();
 */
```

### Consistent Function Documentation

Document complex functions with what AI needs to know:

```rust
/// Validates that an agent session can be spawned.
///
/// # Checks performed
/// - Agent exists in registry
/// - No conflicting session running
/// - Required environment variables set
/// - Team configuration is valid
///
/// # Returns
/// - Ok(ValidatedSession) - Ready to spawn
/// - Err(ValidationError) - With specific failure reason
///
/// # Used by
/// - `spawn_agent` command
/// - `restart_agent` command
pub fn validate_spawn_request(args: &SpawnArgs) -> Result<ValidatedSession, ValidationError> {
```

---

## File Size Checklist

Before committing, check file sizes:

```bash
# Find files over 400 lines
find app/src-tauri/src -name "*.rs" -exec wc -l {} \; | awk '$1 > 400 {print}'
find app/src -name "*.ts" -o -name "*.tsx" -exec wc -l {} \; | awk '$1 > 400 {print}'
```

If any file exceeds limits, refactor before committing.

---

## Migration Priority

Files to refactor (in order of impact):

1. **scheduler/commands.rs** (3,351 lines) → Split into 6 modules
2. **commands/lifecycle.rs** (2,453 lines) → Split into 4 modules
3. **TeamsPanel.tsx** (1,611 lines) → Split into 5 components + 2 hooks
4. **commands/projects.rs** (1,523 lines) → Split into 3 modules
5. **TeamDesigner.tsx** (1,104 lines) → Split into 3 components + 1 hook

---

## When Adding New Code

1. **Check existing file size** - If adding to a file would push it over 400 lines, split first
2. **Choose the right location** - Use the naming patterns above
3. **Keep functions focused** - Max ~50-80 lines per function
4. **Extract shared types** - Put types used by multiple files in `types.rs`/`.types.ts`
5. **Document the module** - Add purpose comment at file top

---

## Summary

The goal is a codebase where any AI can:
1. **Find** relevant code with simple glob/grep patterns
2. **Read** entire files without pagination
3. **Understand** file purpose from name and doc comment
4. **Modify** code safely with full context

When in doubt: **smaller files are better**.
