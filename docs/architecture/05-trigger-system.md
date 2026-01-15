# Agent Trigger System

**Files:**
- `src-tauri/src/scheduler/types.rs` - TriggerConfig, trigger types
- `src-tauri/src/scheduler/manager.rs` - Scheduler Manager
- `src-tauri/src/scheduler/executor.rs` - Agent Executor

The Trigger System provides four distinct mechanisms for activating agents. Each mechanism serves different use cases and can be combined in a single agent configuration.

## Trigger Types Overview

```mermaid
flowchart TB
    subgraph Triggers["Agent Trigger Types"]
        Cron["Schedule/Cron<br/>Time-based activation"]
        Command["Command/Manual<br/>User-invoked slash commands"]
        Event["Event<br/>System event reactions"]
        Pipeline["Pipeline Stage<br/>Workflow progression"]
    end

    subgraph Executor["Executor"]
        Exec[Agent Executor]
    end

    Cron --> Exec
    Command --> Exec
    Event --> Exec
    Pipeline --> Exec
```

## Trigger Configuration

Each agent can have multiple triggers defined in `agent.yaml`:

```yaml
triggers:
  # Time-based trigger
  schedule:
    cron: "0 9 * * 1"  # Every Monday at 9am
    timezone: "America/New_York"

  # Manual command trigger
  command:
    command: "/security-scan"
    button_label: "Run Security Scan"
    icon: "shield"

  # Event-based triggers (multiple allowed)
  events:
    - event_type: git_push
      debounce_ms: 5000
    - event_type: file_changed
      pattern: "*.rs"
      debounce_ms: 2000

  # Pipeline stage trigger
  pipeline_stage:
    pipeline: "feature-implementation"
    stage_type: Analyzer
    order: 1
```

## Trigger 1: Schedule/Cron

```mermaid
sequenceDiagram
    participant Cron as Cron Scheduler
    participant Mgr as Scheduler Manager
    participant Exec as Executor
    participant Agent as Agent (tmux)

    Note over Cron: Cron fires at scheduled time

    Cron->>Mgr: Job triggered
    Mgr->>Mgr: Check ConcurrencyPolicy

    alt allow_parallel = false & already running
        Mgr->>Mgr: Skip or queue
    else
        Mgr->>Exec: execute_cron_agent(config)
        Exec->>Agent: Spawn in tmux
        Agent-->>Exec: Output stream
        Agent->>Exec: Exit
        Exec->>Mgr: Run complete
    end
```

**Configuration:**
```mermaid
classDiagram
    class AgentSchedule {
        +String cron
        +Option~String~ timezone
    }

    class CatchUpPolicy {
        <<enumeration>>
        Skip
        RunOnce
        RunAll
    }

    note for AgentSchedule "Cron: 5-field format\nminute hour day month weekday"
```

## Trigger 2: Command/Manual

```mermaid
sequenceDiagram
    participant User
    participant UI as Frontend UI
    participant Cmd as Command Handler
    participant Exec as Executor
    participant Agent as Agent (tmux)

    User->>UI: Click button or type /command
    UI->>Cmd: invoke_agent(name, args)
    Cmd->>Cmd: Validate command exists
    Cmd->>Exec: Execute with user input
    Exec->>Agent: Spawn with args
    Agent-->>User: Real-time output
    Agent->>Exec: Exit
```

**Configuration:**
```mermaid
classDiagram
    class InvocationConfig {
        +Option~String~ command
        +String button_label
        +Option~String~ icon
    }

    note for InvocationConfig "command: /slash-command\nbutton_label: UI display\nicon: lucide icon name"
```

## Trigger 3: Event-Based

```mermaid
sequenceDiagram
    participant Source as Event Source
    participant Bus as Event Bus
    participant Mgr as Scheduler Manager
    participant Exec as Executor
    participant Agent as Agent

    Source->>Bus: emit(SystemEvent)
    Bus->>Mgr: broadcast

    Mgr->>Mgr: Find agents with matching EventTrigger
    Mgr->>Mgr: Check pattern match
    Mgr->>Mgr: Check debounce timer

    alt Debounce passed & pattern matches
        Mgr->>Exec: execute_cron_agent(config)
        Exec->>Agent: Spawn
    else Debounced or no match
        Mgr->>Mgr: Skip (coalesce events)
    end
```

**Configuration:**
```mermaid
classDiagram
    class EventTrigger {
        +EventType event_type
        +Option~String~ pattern
        +u32 debounce_ms
    }

    class EventType {
        <<enumeration>>
        IdeaApproved
        IdeaReceived
        TeamWorkflowStarted
        TeamWorkflowFinished
        UserLoggedIn
        GitPush
        FileChanged
        StateChange
    }
```

## Trigger 4: Pipeline Stage

```mermaid
sequenceDiagram
    participant Pipeline as Pipeline Manager
    participant Mgr as Scheduler Manager
    participant Exec as Executor
    participant Agent as Stage Agent

    Note over Pipeline: Stage N completes

    Pipeline->>Pipeline: Determine next stage
    Pipeline->>Mgr: Find agent for stage

    Mgr->>Mgr: Query agents by PipelineStageConfig
    Mgr->>Mgr: Sort by order

    Mgr->>Exec: Execute stage agent
    Exec->>Agent: Spawn with pipeline context
    Agent-->>Pipeline: Output stream
    Agent->>Exec: Exit with verdict
    Exec->>Pipeline: Stage complete
```

**Configuration:**
```mermaid
classDiagram
    class PipelineStageConfig {
        +String pipeline
        +PipelineStageType stage_type
        +u32 order
    }

    class PipelineStageType {
        <<enumeration>>
        Implementer
        Analyzer
        Qa
        Merger
    }
```

## Combined Trigger Flow

An agent can have multiple triggers. Here's how they're resolved:

```mermaid
flowchart TB
    subgraph Config["Agent Configuration"]
        Legacy[Legacy Fields<br/>schedule, invocation, event_trigger]
        New[TriggerConfig<br/>triggers: {...}]
    end

    subgraph Resolution["effective_triggers()"]
        Merge[Merge legacy + new<br/>New takes precedence]
    end

    subgraph Activation["Activation Paths"]
        A1[Cron Job fires]
        A2[User invokes command]
        A3[Event matches pattern]
        A4[Pipeline advances stage]
    end

    subgraph Executor["Single Executor"]
        Exec[execute_cron_agent]
    end

    Legacy --> Merge
    New --> Merge
    Merge --> A1
    Merge --> A2
    Merge --> A3
    Merge --> A4

    A1 --> Exec
    A2 --> Exec
    A3 --> Exec
    A4 --> Exec
```

## Concurrency Control

All triggers respect the agent's concurrency policy:

```mermaid
stateDiagram-v2
    [*] --> TriggerReceived

    TriggerReceived --> CheckRunning

    state CheckRunning <<choice>>
    CheckRunning --> Execute: not running
    CheckRunning --> PolicyCheck: already running

    state PolicyCheck <<choice>>
    PolicyCheck --> Execute: allow_parallel = true
    PolicyCheck --> Queue: queue_if_running = true
    PolicyCheck --> Skip: both false

    Execute --> Running
    Running --> [*]: complete

    Queue --> Queued
    Queued --> Execute: previous completes

    Skip --> [*]: dropped
```

**Concurrency Policy:**
```yaml
concurrency:
  allow_parallel: false  # Can multiple instances run?
  queue_if_running: true # Queue trigger if already running?
```

## Trigger Comparison

| Trigger | Activation | Use Case | Timing |
|---------|------------|----------|--------|
| **Schedule** | Cron expression | Periodic maintenance, reports | Predictable |
| **Command** | User action | On-demand tasks | User-initiated |
| **Event** | System event | Reactive automation | Event-driven |
| **Pipeline** | Stage completion | Workflow progression | Pipeline-driven |

## Key Characteristics

| Aspect | Description |
|--------|-------------|
| **Multi-trigger** | Single agent can have multiple trigger types |
| **Legacy support** | Old fields merged with new TriggerConfig |
| **Concurrency** | Per-agent policy (parallel/queue/skip) |
| **Debounce** | Event triggers have configurable debounce |
| **Catch-up** | Cron can skip/run-once/run-all missed jobs |
| **Context** | All triggers pass through same executor |
