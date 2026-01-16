# Inter-Agent Messaging Coordination

> 🔬 **EXPERIMENTAL**: Inter-agent messaging is one of several orchestration approaches under evaluation. It enables direct point-to-point communication between agents via tmux injection. See `06-coordination-comparison.md` for comparison with other patterns.

**File:** `src-tauri/src/commands/communicator.rs`

The Inter-Agent Messaging system enables direct communication between agents via tmux session injection. Unlike the Event Bus (fire-and-forget pub/sub), this system provides point-to-point and broadcast messaging with delivery confirmation.

## Message Delivery Mechanism

Messages are delivered by injecting text directly into tmux panes:

```mermaid
flowchart LR
    subgraph Sender["Sender"]
        App[Nolan App<br/>or Agent]
    end

    subgraph Delivery["Delivery Layer"]
        Tmux[tmux send-keys]
    end

    subgraph Receiver["Receiver Agent"]
        Pane[tmux pane]
        Claude[Claude Code CLI]
    end

    App -->|send_message| Tmux
    Tmux -->|inject text| Pane
    Pane -->|stdin| Claude
```

## Message ID Format

Messages are tagged with unique IDs for tracking:

```
MSG_<SENDER>_<8-HEX-CHARS>
```

Examples:
- `MSG_ANALYZER_a1b2c3d4` - Message from analyzer agent
- `MSG_USER_deadbeef` - Message from Nolan app (user)

## Session Naming Conventions

```mermaid
flowchart TB
    subgraph Sessions["Tmux Session Names"]
        Core["Core Agent<br/>agent-{team}-{name}<br/>e.g., agent-alpha-ana"]
        Spawned["Spawned Instance<br/>agent-{team}-{name}-{instance}<br/>e.g., agent-alpha-ana-2"]
        Ralph["Ralph (Team-Independent)<br/>agent-ralph-{id}<br/>e.g., agent-ralph-ziggy"]
    end
```

## Messaging Patterns

### Pattern 1: Point-to-Point

```mermaid
sequenceDiagram
    participant Sender as Sender Agent
    participant Comm as Communicator
    participant Target as Target Agent

    Sender->>Comm: send_message(team, target, message)
    Comm->>Comm: Validate target format
    Comm->>Comm: Build session name: agent-{team}-{target}
    Comm->>Comm: exit_copy_mode(session)
    Comm->>Comm: wait_for_ready(session, 30s)
    Comm->>Target: tmux send-keys "{MSG_ID}: {message}"
    Comm->>Comm: Poll for delivery confirmation
    Comm-->>Sender: Success/Failure
```

### Pattern 2: Team Broadcast

```mermaid
sequenceDiagram
    participant Sender as Sender
    participant Comm as Communicator
    participant A1 as Agent 1
    participant A2 as Agent 2
    participant A3 as Agent 3

    Sender->>Comm: broadcast_team(team, message)
    Comm->>Comm: Load team config
    Comm->>Comm: Get active sessions

    par Parallel delivery
        Comm->>A1: send to agent-{team}-{agent1}
        Comm->>A2: send to agent-{team}-{agent2}
        Comm->>A3: send to agent-{team}-{agent3}
    end

    Comm-->>Sender: BroadcastResult { successful, failed }
```

### Pattern 3: All Sessions Broadcast

```mermaid
sequenceDiagram
    participant Sender as Sender
    participant Comm as Communicator
    participant S1 as Session 1
    participant S2 as Session 2
    participant SN as Session N

    Sender->>Comm: broadcast_all(team, message)
    Comm->>Comm: tmux list-sessions
    Comm->>Comm: Filter sessions matching agent-*

    par Parallel delivery to all
        Comm->>S1: send to matching session
        Comm->>S2: send to matching session
        Comm->>SN: send to matching session
    end

    Comm-->>Sender: BroadcastResult { successful, failed }
```

## Delivery Confirmation

The system waits for the message to appear in the target pane:

```mermaid
stateDiagram-v2
    [*] --> ValidateTarget
    ValidateTarget --> BuildSession: valid
    ValidateTarget --> Error: invalid format

    BuildSession --> ExitCopyMode
    ExitCopyMode --> WaitReady
    WaitReady --> SendMessage: ready (❯ prompt)
    WaitReady --> Error: timeout (30s)

    SendMessage --> PollConfirm
    PollConfirm --> PollConfirm: message not found
    PollConfirm --> Success: message confirmed
    PollConfirm --> Retry: timeout (5s)

    Retry --> SendMessage: attempts < 2
    Retry --> Error: max retries

    Success --> [*]
    Error --> [*]
```

## Target Validation Patterns

```mermaid
flowchart TB
    subgraph Patterns["Valid Target Formats"]
        P1["Core Agent Name<br/>^[a-z][a-z0-9_]*$<br/>e.g., ana, dl_coordinator"]
        P2["Spawned Instance<br/>^[a-z][a-z0-9_]*-[a-z0-9]+$<br/>e.g., ana-2, ralph-ziggy"]
    end

    subgraph Sessions["Resolved Session Names"]
        S1["agent-{team}-{name}<br/>e.g., agent-alpha-ana"]
        S2["agent-{team}-{name}-{instance}<br/>e.g., agent-alpha-ana-2"]
        S3["agent-ralph-{id}<br/>e.g., agent-ralph-ziggy"]
    end

    P1 --> S1
    P2 --> S2
    P2 --> S3
```

## Data Structures

```mermaid
classDiagram
    class MessageDelivery {
        +String session
        +String message_id
        +String content
        +send() Result
        +confirm() bool
    }

    class BroadcastResult {
        +Vec~String~ successful
        +Vec~String~ failed
    }

    class TargetList {
        +Vec~String~ targets
        +has_active(name) bool
    }

    class DeliveryConfig {
        +u64 timeout_secs = 5
        +u32 retry_count = 2
        +u64 poll_interval_ms = 200
        +u64 ready_timeout_secs = 30
    }
```

## Comparison with Event Bus

| Aspect | Inter-Agent Messaging | Event Bus |
|--------|----------------------|-----------|
| **Pattern** | Point-to-point / Broadcast | Pub/Sub |
| **Delivery** | Confirmed (poll-based) | Fire-and-forget |
| **Target** | Specific session(s) | All subscribers |
| **Medium** | tmux pane injection | tokio broadcast channel |
| **Retry** | Built-in (2 attempts) | None |
| **Scope** | Team-scoped sessions | System-wide |
| **Use case** | Direct coordination | Event triggers |

## Key Characteristics

| Aspect | Description |
|--------|-------------|
| **Pattern** | Point-to-point and broadcast with confirmation |
| **Delivery** | tmux send-keys injection |
| **Confirmation** | Poll pane content for message ID |
| **Timeout** | 5 seconds per delivery, 30s for ready wait |
| **Retry** | 2 attempts on failure |
| **Scope** | Team-scoped (agent-{team}-{name}) |
| **Message ID** | `MSG_{SENDER}_{8-hex}` for tracking |
