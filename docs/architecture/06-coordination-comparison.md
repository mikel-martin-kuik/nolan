# Agent Coordination Systems Comparison

This document compares the experimental coordination mechanisms in Nolan to help analyze their strengths, weaknesses, and appropriate use cases.

## Overview of Coordination Systems

```mermaid
flowchart TB
    subgraph Sequential["Sequential Coordination"]
        Pipeline["Agent Pipeline<br/>4-stage fixed workflow"]
        TeamPipe["Team Pipeline<br/>Dynamic phase workflow"]
    end

    subgraph Reactive["Reactive Coordination"]
        EventBus["Event Bus<br/>Pub/Sub triggers"]
        Trigger["Trigger System<br/>Multi-source activation"]
    end

    subgraph Direct["Direct Coordination"]
        Messaging["Inter-Agent Messaging<br/>Point-to-point & broadcast"]
    end

    Pipeline -.->|can trigger| EventBus
    TeamPipe -.->|can trigger| EventBus
    EventBus -.->|can activate| Pipeline
    EventBus -.->|can activate| TeamPipe
    Trigger -.->|activates all| Pipeline
    Trigger -.->|activates all| TeamPipe
```

## Comparison Matrix

| Aspect | Agent Pipeline | Team Pipeline | Event Bus | Inter-Agent Messaging | Trigger System |
|--------|---------------|---------------|-----------|----------------------|----------------|
| **Pattern** | State machine | Hierarchical SM | Pub/Sub | Point-to-point | Multi-source |
| **Coupling** | Tight (stages) | Tight (phases) | Loose | Medium | Loose |
| **Direction** | Unidirectional | Unidirectional | Many-to-many | Any-to-any | Source→Agent |
| **Feedback** | Verdict loop | Revision loop | None | Bidirectional | None |
| **Persistence** | JSON state | JSON state | None | None | Cron jobs |
| **Scope** | Single feature | Multi-phase project | System-wide | Team-scoped | Per-agent |

## Coordination Patterns

### 1. Agent Pipeline: Sequential State Machine

```mermaid
graph LR
    A[Implementer] --> B[Analyzer]
    B -->|Complete| C[QA]
    B -->|Followup| A
    C --> D[Merger]

    style A fill:#90EE90
    style B fill:#87CEEB
    style C fill:#FFB6C1
    style D fill:#DDA0DD
```

**Characteristics:**
- Fixed 4-stage structure
- Verdict-driven progression (Complete/Followup/Failed)
- Git worktree isolation per pipeline
- Suitable for: Feature implementation with quality gates

### 2. Team Pipeline: Hierarchical Workflow

```mermaid
graph TB
    subgraph P1["Phase 1"]
        E1[Execute] --> V1[Validate]
    end
    subgraph P2["Phase 2"]
        E2[Execute] --> V2[Validate]
    end
    subgraph P3["Phase 3"]
        E3[Execute] --> V3[Validate]
    end

    V1 -->|Complete| E2
    V1 -->|Revision| E1
    V2 -->|Complete| E3
    V2 -->|Revision| E2
```

**Characteristics:**
- Dynamic phases from team.yaml
- Each phase has execution + validation
- Revision feedback within phases
- Suitable for: Multi-phase projects (research → design → implement)

### 3. Event Bus: Pub/Sub Broadcast

```mermaid
graph TB
    P1[Publisher 1] --> Bus((Event Bus))
    P2[Publisher 2] --> Bus
    P3[Publisher 3] --> Bus

    Bus --> S1[Subscriber 1]
    Bus --> S2[Subscriber 2]
    Bus --> S3[Subscriber 3]
```

**Characteristics:**
- Decoupled publishers and subscribers
- Fire-and-forget delivery
- Debounce per subscriber
- Suitable for: Reactive automation (git push → reindex)

### 4. Inter-Agent Messaging: Direct Communication

```mermaid
graph LR
    A1[Agent 1] <-->|point-to-point| A2[Agent 2]
    A3[Sender] -->|broadcast| A1
    A3 -->|broadcast| A2
    A3 -->|broadcast| A4[Agent 4]
```

**Characteristics:**
- Delivery confirmation (poll-based)
- Team-scoped routing
- Supports both P2P and broadcast
- Suitable for: Explicit agent coordination, handoffs

### 5. Trigger System: Multi-Source Activation

```mermaid
graph TB
    Cron[Cron Schedule] --> Agent
    Cmd[User Command] --> Agent
    Event[System Event] --> Agent
    Stage[Pipeline Stage] --> Agent

    Agent[Agent Executor]
```

**Characteristics:**
- Multiple activation sources per agent
- Unified execution path
- Concurrency control
- Suitable for: Flexible agent activation

## Experimental Analysis

### Overlap and Redundancy

```mermaid
flowchart LR
    subgraph Overlap1["Event Activation"]
        EB[Event Bus]
        TS[Trigger System Events]
    end

    subgraph Overlap2["Workflow Management"]
        AP[Agent Pipeline]
        TP[Team Pipeline]
    end

    EB <-.->|"Similar purpose"| TS
    AP <-.->|"Similar pattern"| TP
```

**Observations:**
1. **Event Bus vs Trigger Events**: Both handle event-based activation. Event Bus is more general-purpose, Trigger System is agent-specific.
2. **Agent vs Team Pipeline**: Both implement staged workflows with feedback. Agent Pipeline is fixed structure, Team Pipeline is configurable.

### Decision Matrix: When to Use What

| Scenario | Recommended System | Reason |
|----------|-------------------|--------|
| Single feature with QA | Agent Pipeline | Fixed quality gates |
| Multi-phase project | Team Pipeline | Dynamic phases |
| React to git changes | Event Bus + Trigger | Loose coupling |
| Agent handoff | Inter-Agent Messaging | Direct coordination |
| Periodic maintenance | Trigger (Cron) | Time-based |
| User-initiated task | Trigger (Command) | Manual control |

### Coordination Flow Example

A complex workflow might use multiple systems:

```mermaid
sequenceDiagram
    participant User
    participant Trigger as Trigger System
    participant TP as Team Pipeline
    participant AP as Agent Pipeline
    participant EB as Event Bus
    participant Msg as Messaging

    User->>Trigger: /start-project (command)
    Trigger->>TP: Launch team workflow

    loop Each Phase
        TP->>AP: Create feature pipeline
        AP->>AP: Impl → Analyze → QA → Merge
        AP->>EB: emit(StageComplete)
        EB->>TP: Next phase trigger
    end

    TP->>Msg: broadcast_team("Project complete")
    TP->>EB: emit(TeamWorkflowFinished)
```

## Strengths & Weaknesses

### Agent Pipeline
| Strengths | Weaknesses |
|-----------|------------|
| Clear quality gates | Fixed structure |
| Verdict feedback loop | Single feature scope |
| Git worktree isolation | No dynamic phases |

### Team Pipeline
| Strengths | Weaknesses |
|-----------|------------|
| Dynamic from team.yaml | More complex state |
| Phase-level validation | Heavier weight |
| Multi-phase support | Requires team config |

### Event Bus
| Strengths | Weaknesses |
|-----------|------------|
| Fully decoupled | No delivery guarantee |
| Multi-subscriber | Fire-and-forget only |
| System-wide reach | No direct response |

### Inter-Agent Messaging
| Strengths | Weaknesses |
|-----------|------------|
| Delivery confirmation | tmux dependency |
| Bidirectional possible | Team-scoped only |
| P2P and broadcast | Higher latency |

### Trigger System
| Strengths | Weaknesses |
|-----------|------------|
| Unified activation | Complexity of multiple sources |
| Concurrency control | Config overhead |
| Multiple trigger types | No coordination itself |

## Consolidation Opportunities

```mermaid
flowchart TB
    subgraph Current["Current: 5 Systems"]
        C1[Agent Pipeline]
        C2[Team Pipeline]
        C3[Event Bus]
        C4[Inter-Agent Messaging]
        C5[Trigger System]
    end

    subgraph Potential["Potential Consolidation"]
        P1["Unified Pipeline<br/>(merge AP + TP)"]
        P2["Unified Events<br/>(merge EB + Triggers)"]
        P3["Keep Messaging<br/>(unique purpose)"]
    end

    C1 -.-> P1
    C2 -.-> P1
    C3 -.-> P2
    C5 -.-> P2
    C4 -.-> P3
```

**Potential simplifications:**
1. **Unified Pipeline**: Merge Agent Pipeline into Team Pipeline as a "single-phase" special case
2. **Unified Events**: Consolidate Event Bus triggers into Trigger System's event mechanism
3. **Keep Messaging**: Inter-Agent Messaging serves a unique purpose (direct coordination)

## Key Files Reference

| System | Primary File | Lines |
|--------|-------------|-------|
| Agent Pipeline | `scheduler/pipeline.rs` | ~34KB |
| Team Pipeline | `scheduler/team_pipeline.rs` | ~21KB |
| Event Bus | `events/bus.rs` | ~66 lines |
| Messaging | `commands/communicator.rs` | ~500 lines |
| Trigger System | `scheduler/types.rs` (TriggerConfig) | Part of 42KB |
