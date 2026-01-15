# Nolan System Overview

High-level architecture of Nolan - the AI Multi-Agent Orchestrator.

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

        subgraph Coordination["Agent Coordination Systems"]
            Pipeline[Pipeline Manager]
            TeamPipeline[Team Pipeline Manager]
            EventBus[Event Bus]
            Communicator[Inter-Agent Communicator]
            Scheduler[Scheduler Manager]
        end

        subgraph Execution["Execution Layer"]
            Executor[Agent Executor]
            Lifecycle[Lifecycle Manager]
            TmuxMgr[Tmux Session Manager]
        end
    end

    subgraph External["External Systems"]
        Tmux[Tmux Sessions]
        Git[Git / Worktrees]
        CLI[CLI Providers<br/>Claude Code / OpenCode]
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
    Commands --> Coordination

    Pipeline --> Executor
    TeamPipeline --> Executor
    Scheduler --> Executor

    Executor --> Lifecycle
    Lifecycle --> TmuxMgr

    TmuxMgr --> Tmux
    Executor --> Git
    Executor --> CLI

    EventBus -.->|broadcasts| Pipeline
    EventBus -.->|broadcasts| TeamPipeline
    Communicator -.->|messages| Tmux

    Scheduler --> AgentYAML
    Pipeline --> PipelineState
    TeamPipeline --> PipelineState
    Executor --> RunLogs
    Lifecycle --> StateJSON
```

## Key Coordination Systems

| System | Purpose | Pattern | File |
|--------|---------|---------|------|
| **Pipeline Manager** | 4-stage agent workflow (Impl→Analyze→QA→Merge) | State Machine | `scheduler/pipeline.rs` |
| **Team Pipeline** | Multi-phase team workflows | Hierarchical State Machine | `scheduler/team_pipeline.rs` |
| **Event Bus** | System-wide event pub/sub | Publish-Subscribe | `events/bus.rs` |
| **Communicator** | Direct agent-to-agent messaging | Point-to-Point + Broadcast | `commands/communicator.rs` |
| **Scheduler** | Time and event-triggered execution | Cron + Event Triggers | `scheduler/manager.rs` |

## Data Flow Summary

```mermaid
flowchart LR
    Trigger[Trigger<br/>Cron/Event/Manual/Pipeline] --> Scheduler
    Scheduler --> Executor
    Executor --> |spawn| Tmux[Tmux Session]
    Tmux --> |output| RunLog[Run Log JSON]
    RunLog --> |verdict| Pipeline[Pipeline Manager]
    Pipeline --> |next stage| Scheduler
```
