# Cronos Cron Agent Update Roadmap

## Current State

The Cronos system provides scheduled automation for AI agents with:
- React frontend (`CronosPanel.tsx`) with Factory, Scheduler, and Audit tabs
- Rust backend using `tokio-cron-scheduler`
- YAML-based agent configuration in `/cronos/agents/{name}/`
- Run history stored as JSON + log files in `/cronos/runs/{date}/`
- One active agent: `cron-git` (auto-commits every 4 hours)

---

## Phase 1: Reliability & Observability

### 1.1 Persistent Scheduler State
**Problem**: Schedules are in-memory only; app restart loses running state.

**Implementation**:
- Add `scheduler_state.json` to persist active schedules
- Track last run timestamps per agent
- Restore state on startup

**Files**: `manager.rs`, `types.rs`

### 1.2 Missed Run Detection & Catch-up
**Problem**: If app is closed during a scheduled run, the run is silently skipped.

**Implementation**:
- Compare `last_run` with expected schedule on startup
- Option to queue missed runs or log warnings
- Add `catch_up_policy` field to `CronAgentConfig` (skip, run_once, run_all)

**Files**: `manager.rs`, `types.rs`, `agent.yaml` schema

### 1.3 Enhanced Run Notifications
**Problem**: Only console logging exists; no user alerts for failures.

**Implementation**:
- System notifications on run completion (success/failure)
- Optional desktop notifications via Tauri
- Error summary in UI notification panel

**Files**: `executor.rs`, `CronosPanel.tsx`

### 1.4 Health Monitoring Dashboard
**Problem**: No aggregate view of agent health across time.

**Implementation**:
- Success/failure rate per agent (last 7/30 days)
- Average duration trends
- Alert thresholds for consecutive failures

**Files**: New `CronosHealthPanel.tsx`, `commands.rs` (new query endpoints)

---

## Phase 2: Execution Improvements

### 2.1 Concurrency Controls
**Problem**: Multiple runs of same agent can execute in parallel.

**Implementation**:
- Add `allow_concurrent` config option (default: false)
- Queue or skip if previous run still active
- Display "running" lock state in UI

**Files**: `manager.rs`, `executor.rs`, `types.rs`

### 2.2 Retry Logic
**Problem**: Transient failures require manual re-trigger.

**Implementation**:
- Add `retry_policy` to config (max_retries, delay_seconds)
- Exponential backoff option
- Distinct status for retried runs

**Files**: `executor.rs`, `types.rs`

### 2.3 Run Cancellation
**Problem**: No way to cancel a long-running agent mid-execution.

**Implementation**:
- Track running process PIDs
- Add `cancel_cron_run` command
- UI cancel button in Scheduler tab

**Files**: `executor.rs`, `commands.rs`, `CronosPanel.tsx`

### 2.4 Resource Limits
**Problem**: Runaway agents could consume excessive resources.

**Implementation**:
- Memory limit per agent
- CPU throttling option
- Automatic kill on resource threshold breach

**Files**: `executor.rs`, `types.rs`

---

## Phase 3: Agent Management

### 3.1 Agent Templates
**Problem**: Creating new agents requires manual YAML setup.

**Implementation**:
- Predefined templates (git-commit, backup, report, cleanup)
- "Create from template" wizard in UI
- Clone existing agent feature

**Files**: `CronosPanel.tsx`, new `templates/` directory

### 3.2 Agent Versioning
**Problem**: No history of agent configuration changes.

**Implementation**:
- Version CLAUDE.md and agent.yaml changes
- Rollback to previous configuration
- Diff view between versions

**Files**: `manager.rs`, `CronosPanel.tsx`

### 3.3 Agent Dependencies
**Problem**: Some agents should run after others complete.

**Implementation**:
- Add `depends_on` field to config
- Chain execution support
- Dependency graph visualization

**Files**: `types.rs`, `manager.rs`, `CronosPanel.tsx`

### 3.4 Environment Variables
**Problem**: No way to pass dynamic config to agents.

**Implementation**:
- Per-agent environment variables in config
- Secure storage for sensitive values
- Runtime variable substitution

**Files**: `types.rs`, `executor.rs`

---

## Phase 4: UI/UX Enhancements

### 4.1 Real-time Run Output
**Problem**: Must wait for completion to see output.

**Implementation**:
- WebSocket streaming of stdout/stderr
- Live output panel in UI
- Auto-scroll with pause option

**Files**: `executor.rs`, new `CronosLiveOutput.tsx`

### 4.2 Cron Expression Builder
**Problem**: Writing cron expressions is error-prone.

**Implementation**:
- Visual schedule picker (day/hour/minute selectors)
- Natural language preview ("Every Tuesday at 3pm")
- Validation with next 5 run times shown

**Files**: New `CronExpressionBuilder.tsx`

### 4.3 Agent Search & Filter
**Problem**: As agent count grows, finding specific agents is difficult.

**Implementation**:
- Search by name/description
- Filter by status (active/inactive)
- Sort by last run, next run, name

**Files**: `CronosPanel.tsx`

### 4.4 Bulk Operations
**Problem**: Managing many agents one-by-one is tedious.

**Implementation**:
- Multi-select agents
- Bulk enable/disable
- Bulk delete with confirmation

**Files**: `CronosPanel.tsx`, `commands.rs`

---

## Phase 5: Advanced Features

### 5.1 Conditional Execution
**Problem**: Agents always run on schedule regardless of context.

**Implementation**:
- Pre-run condition checks (file exists, git changes, etc.)
- Skip run with reason logged
- Condition builder in UI

**Files**: `executor.rs`, `types.rs`, `CronosPanel.tsx`

### 5.2 Run Triggers Beyond Cron
**Problem**: Only time-based scheduling available.

**Implementation**:
- File watcher triggers
- Git hook triggers
- Manual webhook endpoint
- Event-based execution

**Files**: New `triggers.rs`, `manager.rs`

### 5.3 Agent Metrics & Cost Tracking
**Problem**: No visibility into token usage or costs.

**Implementation**:
- Parse Claude output for token counts
- Calculate estimated cost per run
- Monthly/weekly cost summaries

**Files**: `executor.rs`, new `CronosMetrics.tsx`

### 5.4 Agent Output Parsing
**Problem**: Only raw text output available.

**Implementation**:
- Structured output extraction (JSON, commits, files changed)
- Output summary generation
- Searchable run history

**Files**: `executor.rs`, `types.rs`

---

## Phase 6: Security & Compliance

### 6.1 Audit Logging
**Problem**: No detailed audit trail of who changed what.

**Implementation**:
- Log all config changes with timestamps
- Track manual triggers vs scheduled runs
- Export audit logs

**Files**: `manager.rs`, new `audit.rs`

### 6.2 Enhanced Guardrails
**Problem**: Current guardrails are basic.

**Implementation**:
- Network access restrictions
- Read-only mode option
- Approval workflow for sensitive operations

**Files**: `types.rs`, `executor.rs`

### 6.3 Run Approval Workflow
**Problem**: High-risk agents run automatically.

**Implementation**:
- Optional approval requirement before execution
- Notification to approve pending runs
- Auto-approve after delay option

**Files**: `manager.rs`, `CronosPanel.tsx`

---

## Priority Recommendations

### High Priority (Core Reliability)
1. Persistent scheduler state (1.1)
2. Concurrency controls (2.1)
3. Run cancellation (2.3)
4. Real-time output (4.1)

### Medium Priority (Usability)
1. Cron expression builder (4.2)
2. Agent templates (3.1)
3. Missed run detection (1.2)
4. Retry logic (2.2)

### Lower Priority (Advanced)
1. Agent dependencies (3.3)
2. Conditional execution (5.1)
3. Non-cron triggers (5.2)
4. Cost tracking (5.3)

---

## Implementation Notes

- Each feature should include unit tests
- UI changes should maintain existing UX patterns
- Backend changes require Tauri command updates
- Consider backwards compatibility with existing agent.yaml files
- Document new configuration options in agent templates
