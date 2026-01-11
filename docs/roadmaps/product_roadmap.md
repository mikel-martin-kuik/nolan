# Product Roadmap

The product roadmap defines **what we build in Nolan** to support the business vision: *deliver projects faster and cheaper than traditional agencies*.

> **The Mechanism**: Spec-driven development. Specs in natural language become the source of truth; AI agents execute them. Code becomes a generated artifact, not a human-authored one.

**Related:** [Business Roadmap](business_roadmap.md)

---

## Product Progress Overview

| Phase | Status | Progress |
|-------|--------|----------|
| **Phase 0:** Architecture | Complete | 100% |
| **Phase 1:** Cost & Execution | Mostly Complete | 98% |
| **Phase 2:** Safety & Versioning | Not Started | 0% |
| **Phase 3:** Context & Communication | Mostly Complete | 95% |
| **Phase 4:** Autonomy & Scale | In Progress | 40% |
| **Phase 5:** Enterprise | Not Started | 0% |
| **Phase 6:** Spec-Driven Development | Not Started | 0% |

---

## Current State (v0.4.6)

### Core Features
- [x] Default team with core workflow agents (Dan, Ana, Bill, Enzo, Carl, Frank, Guardian)
- [x] Phase-gate workflow with automatic handoffs and QA gates
- [x] Document-based outputs (research.md, plan.md, progress.md, implementation-audit.md)
- [x] Tauri-based dashboard with 8 main tabs (Status, Chat, Projects, Teams, Agents, Cronos, Usage, Settings)
- [x] Stop hook automation for handoffs with coordinator ACK protocol
- [x] Cronos scheduler integration for automated task execution
- [x] Full REST API with authentication and WebSocket streaming
- [x] Password-based authentication with Argon2 hashing

### Dashboard & UI
- [x] Real-time agent output streaming with activity indicators
- [x] Native terminal integration (xterm.js embedded + external)
- [x] Workflow-aware agent grouping (Needs Attention, Active, Blocked, Idle, Complete)
- [x] Collapsible team cards with persisted state
- [x] Projects panel with file viewer and workflow steps
- [x] Team Chat interface with per-team message views
- [x] Department grouping for team organization

### Usage & Cost Tracking
- [x] Per-project, per-model, per-agent cost breakdown
- [x] Timeline view with date range filtering
- [x] Session-level usage details
- [x] Claude Opus/Sonnet/Haiku pricing

---

## Phase 0: Architecture Foundation (Complete)

### 0.1 Client/Server Separation (Implemented)
- [x] Full REST API in `src-tauri/src/api/routes.rs`
- [x] WebSocket streaming for terminals
- [x] Browser-based frontend access supported
- [x] Environment-configurable host/port

### 0.2 Provider Configuration (Pending)
- [ ] Provider abstraction layer
- [ ] Per-agent model configuration
- [ ] Fallback chain
- [ ] Cost comparison dashboard

---

## Phase 1: Cost & Execution Management (98% Complete)

### 1.1 Usage & Cost Analytics (Implemented)
- [x] Real-time cost tracking
- [x] JSONL-based usage storage
- [x] Per-agent, per-model, per-project breakdowns
- [ ] Visual charts (Recharts integration)
- [ ] Export for accounting (CSV, JSON)

### 1.2 Background Execution Queue (Pending)
- [ ] Execution queue system
- [ ] Parallel agent spawning
- [ ] Execution history
- [ ] Retry mechanisms

### 1.3 Real-Time Streaming (Implemented)
- [x] Terminal stream via tmux capture
- [x] Per-session streaming
- [x] Activity tracking and deduplication

### 1.4 Process Control (Implemented)
- [x] Session registry
- [x] Spawn, kill, restart operations
- [x] External terminal support
- [ ] Resource monitoring (CPU, memory)

---

## Phase 2: Safety & Versioning (0% Started)

### 2.1 Permission-Controlled Agents
- [ ] Agent capability matrix
- [ ] Pre-configured agent modes
- [ ] Audit logging
- [ ] Permission violation handling

### 2.2 Timeline & Checkpoints
- [ ] Content-addressable storage
- [ ] Auto-checkpointing on phase transitions
- [ ] Checkpoint operations (create, list, diff, restore)
- [ ] Workflow branch visualization

---

## Phase 3: Context & Communication (95% Complete)

### 3.1 Hierarchical Context
- [ ] Organization-level context
- [ ] Department-level context
- [x] Team-level context (YAML configuration)
- [x] Agent-level context (CLAUDE.md, agent.json)
- [ ] Context inheritance engine

### 3.2 Agent Communication (Implemented)
- [x] Message delivery with verified IDs
- [x] Broadcast to team or all agents
- [x] Delivery confirmation
- [x] Team-scoped chat
- [ ] Communication dashboard (inbox, threads, search)

---

## Phase 4: Autonomy & Scale (40% In Progress)

### 4.1 Agent Autonomy
- [ ] Decision framework
- [ ] Long-term memory
- [ ] Automated quality gates

### 4.2 Multi-Project Management
- [ ] Project isolation
- [ ] Project templates

### 4.3 Team Management
- [ ] Team dashboard
- [ ] Resource allocation

---

## Phase 5: Enterprise (0% Started)

### 5.1 Governance & Compliance
- [ ] Audit trail
- [ ] RBAC, SSO, API keys

### 5.2 External Integrations
- [ ] Jira/Linear integration
- [ ] Slack/Discord notifications
- [ ] Confluence/Notion documentation

### 5.3 Alternative Interfaces
- [ ] TUI interface (SSH)
- [ ] Web interface
- [ ] AI-powered insights

---

## Phase 6: Spec-Driven Development (0% Started)

> **The Breakthrough**: This phase transforms Nolan from an agent orchestrator into a spec-first development platform. Specs become the source of truth. Code becomes a generated artifact.

**Team Assignment**: Default team (core workflow agents: Ana, Bill, Enzo, Carl, Frank, Dan)

**New Agents Required**:
- `cron-spec-generator`: Converts accepted proposals to formal specs
- `spec-reviewer` (or extend Enzo's role): Reviews specs before project creation

**Priority**: NEAR-TERM (enables Transition Phase 2: Spec Foundation)

### Foundation: The Ideas System (Already Exists)

The Ideas/Support system already provides the starting point:

**What exists today:**
- `ideas.jsonl`: User-submitted ideas with title, description, status
- `cron-idea-processor`: AI agent that analyzes ideas and creates proposals
- `inbox-reviews.jsonl`: AI-generated proposals with gaps identified
- `idea-reviews.jsonl`: Accepted proposals (ready for implementation)
- Kanban UI: New → Analysis → Ready → Done

**Current Flow (with gap):**
```
Idea → cron-idea-processor → Proposal → User accepts → [MANUAL GAP] → Project → Code
                                              ↓
                                     inbox-reviews.jsonl
```

**The gap**: Accepted proposals don't automatically become specs or projects. Manual intervention required.

### Target Flow
```
Idea → Proposal → SPEC (auto-generated) → Project (auto-created) → Code
```

### Implementation Sequence

| Sub-phase | Depends On | Priority |
|-----------|------------|----------|
| **6.1 Spec Layer** | Ideas system (exists) | First - Foundation |
| **6.2 Spec as Contract** | 6.1 | Second |
| **6.3 Spec Composition** | 6.2 | Third (can parallel 6.4) |
| **6.4 Natural Language Interface** | 6.1 | Third (can parallel 6.3) |
| **6.5 Self-Development Loop** | 6.1-6.4 | Last - Validates everything |

---

### 6.1 The Spec Layer (Foundation)

Add formal specifications as first-class entities between ideas and projects.

**New Artifacts:**
- `spec.md` in project template
- `cron-spec-generator` agent
- Spec review workflow phase

**Spec Format:**
```markdown
# Specification: {Title}

## Overview
{One-sentence summary}

## Requirements
- Functional: {list}
- Non-functional: {list}
- Constraints: {list}

## Acceptance Criteria
1. {criterion with testable condition}
2. {criterion with testable condition}

## Dependencies
- Projects: {related projects}
- Components: {existing code}

## Scope
- Includes: {features in scope}
- Excludes: {features explicitly out of scope}

## Implementation Hints
{code paths, patterns, relevant files}
```

**Implementation:**
- [ ] Add `spec.md` to project template
- [ ] Create `cron-spec-generator` agent (converts accepted proposals to specs)
- [ ] Add spec review phase to default team workflow
- [ ] Link idea acceptance → spec creation in frontend
- [ ] Update Bill's planner to read from spec, not just research

**Validation:**
- [ ] Accepted idea auto-generates spec.md
- [ ] Spec visible in project file viewer
- [ ] Bill's plan references spec requirements
- [ ] Frank audits implementation against spec

---

### 6.2 Spec as Contract

Specs become the authoritative source. Code is validated against specs.

**Features:**
- [ ] Spec versioning (track changes over project lifecycle)
- [ ] Spec diff tracking (what changed between versions)
- [ ] Compliance validation (does code satisfy spec?)
- [ ] Spec-to-test generation (acceptance criteria → test cases)

**New Workflow:**
```
Spec Change → Impact Analysis → Re-plan → Re-implement → Re-validate
```

**Implementation:**
- [ ] Version specs with git-like history
- [ ] Frank validates code against spec acceptance criteria
- [ ] Generate test stubs from acceptance criteria
- [ ] Block completion if spec compliance fails

---

### 6.3 Spec Composition

Complex features decompose into composable spec building blocks.

**Spec Dependencies:**
```yaml
spec: user-auth
  requires: [database, session-management]

spec: admin-dashboard
  requires: [user-auth, analytics]

spec: full-product
  requires: [admin-dashboard, payments]
```

**Features:**
- [ ] Spec dependency graph
- [ ] Cross-project impact analysis
- [ ] Capacity planning from spec complexity
- [ ] Spec templates for common patterns

**Implementation:**
- [ ] Dependency syntax in spec.md
- [ ] Visualize spec dependency graph
- [ ] Warn on circular dependencies
- [ ] Calculate project scope from spec tree

---

### 6.4 Natural Language Interface

Conversation becomes the primary interface for spec creation.

**Target Interaction:**
```
User: "I want users to export their data as CSV"

Nolan:
├── Searches existing specs for related features
├── Identifies affected components (data layer, API, UI)
├── Generates draft spec with gaps highlighted
├── Shows impact on current roadmap
└── Asks: "Shall I create this spec?"
```

**Features:**
- [ ] Conversational spec creation
- [ ] Automatic gap detection (missing requirements)
- [ ] Roadmap integration (where does this fit?)
- [ ] Conflict detection (contradicts existing spec?)

**Implementation:**
- [ ] Natural language → spec draft generation
- [ ] Semantic search across existing specs
- [ ] Conflict detection algorithm
- [ ] Roadmap impact visualization

---

### 6.5 Self-Development Loop

Nolan develops itself through specs.

**The Loop:**
```
1. User writes spec for Nolan feature
2. Nolan's agents implement the spec
3. New capability added to Nolan
4. Better spec tooling enables faster spec writing
5. Return to step 1 (accelerating cycle)
```

**Validation:**
- [ ] Nolan can accept specs for its own features
- [ ] Implementation cycle completes end-to-end
- [ ] New features demonstrably improve spec workflow

---

## Product-Business Alignment

| Product Phase | Business Goal Support |
|---------------|----------------------|
| Phase 0: Architecture | Foundation for all goals |
| Phase 1: Cost & Execution | Cost tracking, delivery tracking |
| Phase 2: Safety & Versioning | Quality assurance |
| Phase 3: Context & Communication | Decision audit |
| Phase 4: Autonomy & Scale | Autonomous scaling |
| Phase 5: Enterprise | Governance, integrations |
| Phase 6: Spec-Driven Development | **Transforms entire delivery model** |

### Phase 6 Business Impact

Phase 6 is transformational. It changes **how we work**, not just **what we build**.

| Business Goal | Phase 6 Impact |
|---------------|----------------|
| Delivery Efficiency | Specs auto-generate plans → faster project starts |
| Competitive Intelligence | Specs enable accurate scoping → better estimates |
| Quality Assurance | Spec compliance validation → provable quality |
| Autonomous Scaling | Specs are executable → higher AI leverage |

**Key Metric**: Human involvement shifts from "writing code" to "approving specs."

---

## Technical Architecture

### Core Technologies
- Tauri 2 (Desktop client)
- React + TypeScript (UI)
- Rust backend (Performance)
- SQLite (Local storage)
- tokio (Async runtime)

### Data Model
```
NolanServer
  +-- Providers[]
  +-- ExecutionQueue
  +-- Agents[]
  |     +-- Capabilities
  |     +-- ProcessInfo
  |     +-- UsageMetrics
  +-- Projects[]
        +-- Sessions[]
        +-- Documents[]
        +-- Estimates[]
        +-- Checkpoints[]
```

---

## Recently Completed (Jan 2026)

### Roadmap Evolution (Jan 11)
- Split into Business Roadmap and Product Roadmap
- Business: Strategy, metrics, feature roadmap
- Product: Phases 0-6, technical features, architecture
- Added Phase 6: Spec-Driven Development (the breakthrough)
- Clarified terminology: Transition Phases vs Product Phases

### Authentication System (Jan 10)
- Password-based authentication with Argon2 hashing
- Session token management
- Auth middleware for protected endpoints

### Phase 0.1 Client/Server Architecture (Jan 10)
- Full REST API implementation
- WebSocket endpoints for real-time terminal output
- Browser-based frontend access enabled

---

## Quick Wins

| Feature | Status | Notes |
|---------|:------:|-------|
| Live cost display in Status panel | Pending | In Usage tab, not Status |
| Visual charts | Pending | Recharts integration |
| Export usage data | Pending | CSV/JSON export |
| Resource monitoring | Pending | CPU, memory tracking |
| Communication dashboard | Pending | Inbox, threads, search |

---

## Known Protocol Gaps

### Handoff Recovery (Not Implemented)

**Problem:** If an agent dies mid-work, the project becomes orphaned.

**Proposed Solutions:**
1. Watchdog Daemon (Recommended)
2. Coordinator Self-Wake Timer
3. Session Heartbeat Protocol
4. Nolan App Integration
