# Nolan System Overview

High-level architecture of Nolan - the AI Manufacturing Line Orchestrator.

## Core Philosophy: Manufacturing Line

Nolan operates like a **manufacturing line**, not a coordination system:

| Concept | Manufacturing Line | Nolan |
|---------|-------------------|-------|
| **Design** | Engineers design stations | Humans design agent workflows |
| **Execution** | Line runs automatically | Agents execute automatically |
| **Flow** | Parts move station to station | Work moves agent to agent |
| **Handoffs** | Programmatic (conveyor) | Programmatic (file-based) |
| **Communication** | None needed | None needed |

**Key principle**: Agents don't coordinate with each other. They receive clear inputs, produce defined outputs, and the system routes work to the next station.

## Component Architecture

```mermaid
graph TB
    subgraph Frontend["Frontend (TypeScript/React)"]
        UI[Web UI]
        Hooks[Custom Hooks]
        WS[WebSocket Client]
    end

    subgraph Backend["Backend (Rust/Tauri)"]
        API[HTTP API Server]
        Commands[Tauri Commands]

        subgraph Pipeline["Manufacturing Line"]
            PipelineMgr[Pipeline Manager<br/>Routes work between stations]
            Scheduler[Scheduler Manager<br/>Triggers station execution]
        end

        subgraph Execution["Execution Layer"]
            Executor[Agent Executor]
            Lifecycle[Lifecycle Manager]
            TmuxMgr[Tmux Session Manager]
        end
    end

    subgraph External["External Systems"]
        Tmux[Tmux Sessions<br/>Isolated workstations]
        Git[Git / Worktrees<br/>Isolated workspaces]
        CLI[CLI Providers<br/>Claude Code]
    end

    subgraph Data["Data Layer (NOLAN_DATA_ROOT)"]
        AgentYAML[Agent Configs<br/>agents/*.yaml]
        TeamYAML[Team Configs<br/>teams/*.yaml]
        StateJSON[Runtime State<br/>.state/scheduler/]
        RunLogs[Run Logs<br/>.state/scheduler/runs/]
        PipelineState[Pipeline State<br/>.state/pipelines/]
    end

    UI --> API
    UI --> WS
    Hooks --> API
    WS --> API

    API --> Commands
    Commands --> Pipeline

    PipelineMgr --> Executor
    Scheduler --> Executor

    Executor --> Lifecycle
    Lifecycle --> TmuxMgr

    TmuxMgr --> Tmux
    Executor --> Git
    Executor --> CLI

    Scheduler --> AgentYAML
    PipelineMgr --> PipelineState
    Executor --> RunLogs
    Lifecycle --> StateJSON
```

## Manufacturing Line Principles

### 1. Clear Inputs & Outputs

Each agent (station) has:
- **Input**: Files, context, or previous station output
- **Instructions**: CLAUDE.md + agent.yaml define the task
- **Output**: Defined deliverables (files, verdicts)

```mermaid
flowchart LR
    Input[Input Files] --> Station[Agent Station]
    Instructions[Instructions<br/>CLAUDE.md + yaml] --> Station
    Station --> Output[Output Files]
    Output --> NextStation[Next Station]
```

### 2. Isolation

Each station operates in isolation:
- Own tmux session (process isolation)
- Own git worktree (code isolation)
- Own context (no shared state)

### 3. Programmatic Routing

Work flows automatically based on:
- Exit codes (success/failure)
- Output file presence
- Verdict files (structured decisions)

No agent-to-agent communication needed.

## Key Systems

| System | Purpose | Pattern |
|--------|---------|---------|
| **Pipeline Manager** | Routes work through stations | State Machine |
| **Scheduler Manager** | Triggers station execution | Cron + Event |
| **Agent Executor** | Runs individual stations | Process Manager |

## Data Flow

```mermaid
flowchart LR
    Trigger[Trigger<br/>Cron/Event/Manual] --> Scheduler
    Scheduler --> Executor
    Executor --> |spawn| Tmux[Station<br/>tmux session]
    Tmux --> |output| Files[Output Files]
    Files --> |verdict| Pipeline[Pipeline Manager]
    Pipeline --> |route to next| Scheduler
```

## What Nolan Is NOT

- **Not a coordination system**: Agents don't talk to each other
- **Not event-driven messaging**: No pub/sub between agents (though under evaluation)
- **Not requiring human intervention for handoffs**: Work flows automatically

## Human Role

Humans **design the manufacturing line**:
- Define agents (stations) in YAML
- Define workflows (line layout) in team configs
- Define quality gates (inspection points)

The line **executes automatically**:
- Scheduler triggers stations
- Pipeline routes work
- Output files flow to next station

## Future: Spec-Driven Development

Nolan is evolving toward **spec-driven development** where:

```mermaid
flowchart LR
    Idea[Idea] --> Proposal[Proposal]
    Proposal --> Spec[Specification]
    Spec --> Pipeline[Manufacturing Line]
    Pipeline --> Code[Generated Code]
```

- **Specs** (natural language) become the source of truth
- **Code** becomes a generated artifact, not human-authored
- **Manufacturing line** executes specs automatically

See `07-spec-driven-architecture.md` for the spec layer architecture (Phase 6).
