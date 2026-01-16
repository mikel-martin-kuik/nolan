# Event Bus Coordination

> 🔬 **EXPERIMENTAL**: The Event Bus is one of several orchestration approaches under evaluation. It provides pub/sub semantics for reactive agent triggering. See `06-coordination-comparison.md` for comparison with other patterns.

**Files:**
- `src-tauri/src/events/bus.rs` - Event bus implementation
- `src-tauri/src/events/types.rs` - Event types
- `src-tauri/src/scheduler/types.rs` - EventType enum, EventTrigger config

The Event Bus implements a publish-subscribe pattern for system-wide event distribution. Components can emit events and agents can subscribe to trigger on specific event patterns.

## Architecture

```mermaid
flowchart TB
    subgraph Publishers["Event Publishers"]
        UI[Frontend UI]
        Pipeline[Pipeline Manager]
        TeamPipe[Team Pipeline]
        Git[Git Watcher]
        FileWatch[File Watcher]
    end

    subgraph Bus["Event Bus (tokio broadcast)"]
        Channel[Broadcast Channel<br/>capacity: 1000]
    end

    subgraph Subscribers["Event Subscribers"]
        Scheduler[Scheduler Manager]
        Agent1[Event Agent 1]
        Agent2[Event Agent 2]
        AgentN[Event Agent N]
    end

    UI -->|emit| Channel
    Pipeline -->|emit| Channel
    TeamPipe -->|emit| Channel
    Git -->|emit| Channel
    FileWatch -->|emit| Channel

    Channel -->|subscribe| Scheduler
    Scheduler -->|trigger| Agent1
    Scheduler -->|trigger| Agent2
    Scheduler -->|trigger| AgentN
```

## Event Types

```mermaid
flowchart LR
    subgraph Events["System Events"]
        IdeaApproved["IdeaApproved<br/>Feature approved for implementation"]
        IdeaReceived["IdeaReceived<br/>New idea submitted"]
        TeamStart["TeamWorkflowStarted<br/>Team workflow launched"]
        TeamFinish["TeamWorkflowFinished<br/>Team workflow completed"]
        GitPush["GitPush<br/>Code pushed to repository"]
        FileChanged["FileChanged<br/>File modified on disk"]
        UserLoggedIn["UserLoggedIn<br/>User authenticated"]
        StateChange["StateChange<br/>Generic state change"]
    end
```

## Event Structure

```mermaid
classDiagram
    class SystemEvent {
        +EventType event_type
        +Value payload
        +String timestamp
        +String source
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

    class EventTrigger {
        +EventType event_type
        +Option~String~ pattern
        +u32 debounce_ms
    }

    class EventBus {
        -Sender~SystemEvent~ sender
        +emit(event)
        +subscribe() Receiver
    }

    EventBus --> SystemEvent : broadcasts
    SystemEvent --> EventType
    EventTrigger --> EventType : filters on
```

## Event-Triggered Agent Configuration

Agents can subscribe to events via their `agent.yaml`:

```yaml
name: code-indexer
trigger:
  events:
    - event_type: git_push
      debounce_ms: 5000  # Wait 5s after last push
    - event_type: file_changed
      pattern: "*.rs"     # Only Rust files
      debounce_ms: 2000
```

## Event Flow Sequence

```mermaid
sequenceDiagram
    participant Source as Event Source
    participant Bus as Event Bus
    participant Scheduler as Scheduler Manager
    participant Agent as Event-Triggered Agent

    Source->>Bus: emit(SystemEvent)
    Bus->>Scheduler: broadcast to subscribers

    Scheduler->>Scheduler: Check registered EventTriggers

    alt Pattern match + debounce passed
        Scheduler->>Agent: Spawn agent
        Agent-->>Scheduler: Execution complete
    else No match or debounced
        Scheduler->>Scheduler: Skip or queue
    end
```

## Debounce Mechanism

Events are debounced per-agent to prevent rapid re-triggering:

```mermaid
sequenceDiagram
    participant FS as File System
    participant Bus as Event Bus
    participant Sched as Scheduler
    participant Agent as code-indexer

    Note over FS,Agent: debounce_ms = 5000

    FS->>Bus: FileChanged (file1.rs)
    Bus->>Sched: event
    Sched->>Sched: Start debounce timer

    FS->>Bus: FileChanged (file2.rs)
    Bus->>Sched: event
    Sched->>Sched: Reset timer (still within 5s)

    FS->>Bus: FileChanged (file3.rs)
    Bus->>Sched: event
    Sched->>Sched: Reset timer

    Note over Sched: 5 seconds pass...

    Sched->>Agent: Spawn (coalesced events)
```

## Comparison with Direct Triggering

| Aspect | Event Bus | Direct Trigger |
|--------|-----------|----------------|
| **Coupling** | Loose (pub/sub) | Tight (direct call) |
| **Multi-subscriber** | Yes | No |
| **Async** | Native async broadcast | Synchronous |
| **Debounce** | Built-in per-agent | Manual |
| **Pattern matching** | Regex/glob on payload | N/A |
| **Observability** | Central event log | Scattered |

## Key Characteristics

| Aspect | Description |
|--------|-------------|
| **Pattern** | Publish-Subscribe with debouncing |
| **Implementation** | tokio broadcast channel (capacity 1000) |
| **Global instance** | Singleton via `once_cell::Lazy` |
| **Event filtering** | EventType + optional pattern regex |
| **Debounce** | Per-agent configurable (default 1000ms) |
| **Persistence** | Events not persisted (fire-and-forget) |
