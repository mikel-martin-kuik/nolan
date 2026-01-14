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
| **Phase 3:** Context & Communication | Complete | 100% |
| **Phase 4:** Autonomy & Scale | In Progress | 75% |
| **Phase 5:** Enterprise | Not Started | 0% |
| **Phase 6:** Spec-Driven Development | In Progress | 20% |

---

## Current State (v0.4.8)

### Core Features
- [x] Default team with core workflow agents (Dan, Ana, Bill, Enzo, Carl, Frank, Guardian)
- [x] Phase-gate workflow with automatic handoffs and QA gates
- [x] Document-based outputs (research.md, plan.md, progress.md, implementation-audit.md)
- [x] Tauri-based dashboard with 8 main tabs (Status, Chat, Ideas, Teams, Agents, Cronos, Usage, Settings)
- [x] Stop hook automation for handoffs with coordinator ACK protocol
- [x] Cronos scheduler integration for automated task execution
- [x] Full REST API with authentication and WebSocket streaming
- [x] Password-based authentication with Argon2 hashing
- [x] Support/Ideas system with Kanban workflow (New → Analysis → Ready → Done)
- [x] 15 pillar team YAML configurations with 65 specialized agents

### Dashboard & UI
- [x] Real-time agent output streaming with activity indicators
- [x] SSH-based terminal integration (replaced xterm.js with ttyd + external terminals)
- [x] Workflow-aware agent grouping (Needs Attention, Active, Blocked, Idle, Complete)
- [x] Collapsible team cards with persisted state
- [x] Ideas Kanban with centralized workflow (Projects panel deprecated)
- [x] Team Chat interface with per-team message views
- [x] Department grouping for team organization
- [x] Cronos agent detail pages with output panels
- [x] Cron group editor for managing cron agent collections
- [x] Quick launch modal for rapid agent/team spawning
- [x] TeamAgentDetailPage for detailed team agent views
- [x] File browser manager for project exploration
- [x] Agent console with enhanced output panels
- [x] Usage stats panel with filtering capabilities
- [x] Run Log Viewer Modal for pipeline execution detail
- [x] Pipeline management UI with stage status tracking
- [x] Hotfixes panel for quick fixes that bypass idea pipeline

### Usage & Cost Tracking
- [x] Per-project, per-model, per-agent cost breakdown
- [x] Timeline view with date range filtering
- [x] Session-level usage details
- [x] Claude Opus/Sonnet/Haiku pricing

### Local AI Integration (Ollama/Lana)
- [x] Ollama connection status monitoring
- [x] AI generation buttons in 6 components (forms, editors, chat)
- [x] Per-component AI assistant prompts (product manager, innovation consultant, etc.)

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

## Phase 3: Context & Communication (100% Complete)

### 3.1 Hierarchical Context
- [x] Organization-level context (via departments.yaml)
- [x] Department-level context (pillar-based structure)
- [x] Team-level context (YAML configuration - 15 teams)
- [x] Agent-level context (CLAUDE.md, agent.json - 65+ agents)
- [x] Context inheritance engine (via .claude symlinks and team configs)

### 3.2 Agent Communication (Implemented)
- [x] Message delivery with verified IDs
- [x] Broadcast to team or all agents
- [x] Delivery confirmation
- [x] Team-scoped chat
- [x] Communication via handoff system and coordinator ACK protocol

---

## Phase 4: Autonomy & Scale (75% In Progress)

### 4.1 Agent Autonomy
- [x] Cronos automated task execution (idea processing, git commits, workflow monitoring)
- [x] cron-idea-processor: AI analysis of ideas with proposal generation
- [x] cron-idea-merger: Consolidation of related ideas
- [x] cron-idea-implementer: Creates projects from approved ideas
- [x] cron-workflow-monitor: Workflow health tracking
- [x] cron-git-commit: Automated git commits with summaries
- [x] cron-dependency-check: Validates project dependencies
- [x] cron-security-audit: Security scanning and vulnerability detection
- [x] cron-bug-finder: Identifies bugs in codebase
- [x] cron-ui-audit: UI/UX audit and improvements
- [x] cron-code-indexer: Indexes codebase for context
- [x] cron-roadmap: Updates roadmaps from activity
- [x] cron-roadmap-alignment: Validates roadmap alignment
- [ ] Decision framework
- [ ] Long-term memory
- [ ] Automated quality gates

### 4.2 Multi-Project Management
- [x] Project file isolation (per-project documents)
- [x] Ideas-centric workflow (Projects panel deprecated)
- [x] Implementation pipeline with analyzer + QA stages
- [x] Git worktree isolation for concurrent implementations
- [ ] Project templates
- [ ] Cross-project coordination

### 4.3 Team Management
- [x] Team dashboard (TeamsPanel with recursive scanning)
- [x] 15 pillar teams with full YAML configurations
- [x] 65 specialized agents with workflow definitions
- [ ] Resource allocation
- [ ] Team performance metrics

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

## Phase 6: Spec-Driven Development (20% In Progress)

> **The Breakthrough**: This phase transforms Nolan from an agent orchestrator into a spec-first development platform. Specs become the source of truth. Code becomes a generated artifact.

**Team Assignment**: Default team (core workflow agents: Ana, Bill, Enzo, Carl, Frank, Dan)

**New Agents Required**:
- `cron-spec-generator`: Converts accepted proposals to formal specs
- `spec-reviewer` (or extend Enzo's role): Reviews specs before project creation
- `cron-idea-implementer`: Auto-creates projects from approved ideas (IMPLEMENTED)

**Priority**: NEAR-TERM (enables Transition Phase 2: Spec Foundation)

### Foundation: The Ideas System (Implemented)

The Ideas/Support system provides the foundation for spec-driven development:

**What exists today (Jan 14, 2026):**
- [x] `ideas.jsonl`: User-submitted ideas with title, description, status
- [x] `cron-idea-processor`: AI agent that analyzes ideas and creates proposals
- [x] `inbox-reviews.jsonl`: AI-generated proposals with gaps identified
- [x] `cron-idea-merger`: Consolidates related ideas
- [x] Full Kanban UI: New → Analysis → Ready → Done
- [x] Idea detail pages with proposal viewing
- [x] Idea editing and status management
- [x] `cron-idea-implementer`: Auto-creates projects from accepted ideas
- [x] Implementation pipeline: Implementer → Analyzer → QA → Merge
- [x] Git worktree isolation for parallel implementations
- [x] Hotfixes system for quick fixes bypassing full pipeline

**Current Flow (operational):**
```
Idea → cron-idea-processor → Proposal → User accepts → cron-idea-implementer → Worktree → Code
                                              ↓                    ↓
                                     inbox-reviews.jsonl     Analyzer → QA → Merge
```

**Progress**: The idea-to-merge pipeline is operational. Focus shifting to spec layer formalization.

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

### Pipeline & UI Infrastructure (Jan 13-14)
- Projects panel deprecated, centralized on Ideas workflow
- SSH-based terminal support (replaced embedded xterm.js with ttyd + external terminals)
- Run Log Viewer Modal for pipeline execution detail
- Hotfixes system for quick fixes bypassing the full idea pipeline
- Pipeline management UI with stage status tracking
- Dependency management restructuring and workflow phase tracking improvements
- Docker containerization improvements for deployment

### Cronos Agent Expansion (Jan 12-13)
- File browser manager implementation for cron-idea-implementer
- TeamAgentDetailPage component for detailed cron agent views
- New cron agents added:
  - cron-bug-finder: Identifies bugs in codebase
  - cron-security-audit: Security scanning and vulnerability detection
  - cron-ui-audit: UI/UX audit and improvements
  - cron-code-indexer: Indexes codebase for context
  - cron-roadmap-alignment: Validates roadmap alignment
  - cron-dependency-check: Validates project dependencies
- Cron-git integration with automated commit summaries
- Agent console implementation with enhanced output panels
- Usage stats panel enhancements
- Total of 12 active cron agents now operational

### Repository & State Consolidation (Jan 11)
- State directory consolidation (`.state/scheduler/`, `.state/handoffs/`, `.state/feedback/`)
- Log rotation script for cronos runs
- Obsolete directory cleanup (mailbox, experimental agents)
- Roadmap files moved to `docs/roadmaps/`
- Stale projects archived to `.legacy/`

### Cronos System Enhancements (Jan 11)
- Cron agent detail pages with full configuration editing
- Cron output panels with real-time streaming
- Cron group editor for managing agent collections
- cron-idea-processor: Analyzes ideas and generates proposals
- cron-idea-merger: Consolidates related ideas
- cron-workflow-monitor: Tracks workflow health

### Ollama/Lana AI Integration (Jan 11)
- Ollama connection status monitoring in settings
- AI generation buttons in 6 components:
  - FeatureRequestForm, IdeaForm (product manager prompts)
  - AgentEditor, TeamEditor (technical writer prompts)
  - CronAgentDetailPage (DevOps specialist prompts)
  - ChatInput (communication assistant prompts)

### Support/Ideas System (Jan 11)
- Full Ideas Kanban workflow (New → Analysis → Ready → Done)
- Idea detail pages with proposal viewing
- Idea editing and status management
- Feature request forms
- inbox-reviews.jsonl for AI-generated proposals

### Team & Agent Infrastructure (Jan 10-11)
- 15 pillar team YAML configurations with complete workflow definitions
- 65 specialized agents with output files, required sections, permissions
- Agent directory renaming (uppercase → lowercase)
- .claude symlinks for all pillar agents
- list_available_teams() now scans subdirectories recursively

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
