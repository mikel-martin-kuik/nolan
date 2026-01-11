# Product Roadmap

The product roadmap defines **what we build in Nolan** to support the business.

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

---

## Current State (v0.4.6)

### Core Features
- [x] 7 active teams aligned with P1-P4 pillars + core agents (Dan, Ana, Bill, Carl, Enzo, Frank, Ralph)
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

## Product-Business Alignment

| Product Phase | Business Pillar Support |
|---------------|------------------------|
| Phase 0: Architecture | Foundation for all pillars |
| Phase 1: Cost & Execution | P4 Cost Tracking, P1 Delivery Tracking |
| Phase 2: Safety & Versioning | P3 Quality Assurance |
| Phase 3: Context & Communication | P3 Decision Audit |
| Phase 4: Autonomy & Scale | P4 Autonomous Scaling |
| Phase 5: Enterprise | P3 Governance, P2 Integrations |

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

### Team Reorganization (Jan 11)
- Consolidated from 15+ teams to 7 teams aligned with P1-P4 pillars
- Created estimation_bidding team for competitive intelligence
- Merged security_operations into quality_automation
- Reorganized directories: p1_delivery, p2_competitive, p3_quality, p4_autonomy

### Roadmap Split (Jan 11)
- Split into Business Roadmap and Product Roadmap
- Business: P1-P4 pillars, project templates, metrics
- Product: Phases 0-5, technical features, architecture

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
