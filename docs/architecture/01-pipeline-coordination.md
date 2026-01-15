# Agent Pipeline Coordination

**File:** `src-tauri/src/scheduler/pipeline.rs`

The Pipeline Manager implements a CI/CD-inspired 4-stage workflow for individual feature implementation. Each stage has a verdict-driven state machine that controls progression.

## Pipeline Stages

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Implementer: Pipeline Created

    state Implementer {
        [*] --> IRunning: spawn
        IRunning --> ISuccess: exit 0
        IRunning --> IFailed: exit != 0
        ISuccess --> [*]
        IFailed --> [*]
    }

    state Analyzer {
        [*] --> ARunning: spawn
        ARunning --> AComplete: verdict=Complete
        ARunning --> AFollowup: verdict=Followup
        ARunning --> AFailed: verdict=Failed
        AComplete --> [*]
        AFollowup --> [*]
        AFailed --> [*]
    }

    state QA {
        [*] --> QRunning: spawn
        QRunning --> QPass: tests pass
        QRunning --> QFail: tests fail
        QPass --> [*]
        QFail --> [*]
    }

    state Merger {
        [*] --> MRunning: spawn
        MRunning --> MMerged: merge success
        MRunning --> MConflict: merge conflict
        MMerged --> [*]
        MConflict --> [*]
    }

    Implementer --> Analyzer: success
    Analyzer --> Implementer: Followup verdict
    Analyzer --> QA: Complete verdict
    Analyzer --> Blocked: Failed verdict
    QA --> Merger: tests pass
    QA --> Implementer: tests fail (retry)
    Merger --> Complete: merged
    Merger --> Blocked: conflict

    Complete --> [*]
    Blocked --> [*]: manual intervention
```

## Verdict-Driven Transitions

The Analyzer produces one of three verdicts that control the workflow:

```mermaid
flowchart TB
    subgraph Verdicts["Analyzer Verdicts"]
        Complete["Complete<br/>Work is done correctly"]
        Followup["Followup<br/>Needs revision with new prompt"]
        Failed["Failed<br/>Unrecoverable error"]
    end

    subgraph Actions["Resulting Actions"]
        Advance["Advance to QA Stage"]
        Relaunch["Relaunch Implementer<br/>with followup prompt"]
        Block["Block Pipeline<br/>await manual intervention"]
    end

    Complete --> Advance
    Followup --> Relaunch
    Failed --> Block
```

## Stage Status State Machine

Each stage has its own status tracking:

```mermaid
stateDiagram-v2
    [*] --> Pending: stage created
    Pending --> Running: agent spawned
    Running --> Success: exit 0 + valid verdict
    Running --> Failed: exit != 0 or invalid
    Success --> [*]
    Failed --> Pending: retry (if attempts < max)
    Failed --> Blocked: max retries exceeded
    Blocked --> [*]

    note right of Running: Tracks run_id, agent_name
    note right of Success: Stores verdict, cost
    note right of Blocked: Requires manual unblock
```

## Pipeline Data Structure

```mermaid
classDiagram
    class Pipeline {
        +String id
        +String idea_id
        +PipelineStatus status
        +Vec~PipelineStage~ stages
        +Vec~PipelineEvent~ events
        +DateTime created_at
        +Option~DateTime~ completed_at
    }

    class PipelineStage {
        +PipelineStageType stage_type
        +PipelineStageStatus status
        +String agent_name
        +Option~String~ run_id
        +Option~AnalyzerVerdict~ verdict
        +u32 attempt
    }

    class PipelineEvent {
        +DateTime timestamp
        +String event_type
        +String description
        +Option~String~ stage
    }

    class AnalyzerVerdict {
        <<enumeration>>
        Complete
        Followup
        Failed
    }

    class PipelineStageType {
        <<enumeration>>
        Implementer
        Analyzer
        Qa
        Merger
    }

    Pipeline "1" --> "*" PipelineStage
    Pipeline "1" --> "*" PipelineEvent
    PipelineStage --> PipelineStageType
    PipelineStage --> AnalyzerVerdict
```

## Coordination Pattern: Sequential with Feedback Loop

```mermaid
sequenceDiagram
    participant User
    participant PipelineMgr as Pipeline Manager
    participant Impl as Implementer Agent
    participant Analyzer as Analyzer Agent
    participant QA as QA Agent
    participant Merger as Merger Agent

    User->>PipelineMgr: Create Pipeline (idea_id)
    PipelineMgr->>PipelineMgr: Initialize 4 stages (Pending)

    rect rgb(200, 230, 200)
        Note over PipelineMgr,Impl: Stage 1: Implementation
        PipelineMgr->>Impl: Spawn in tmux
        Impl-->>PipelineMgr: Output stream
        Impl->>PipelineMgr: Exit (success/fail)
    end

    rect rgb(200, 200, 230)
        Note over PipelineMgr,Analyzer: Stage 2: Analysis
        PipelineMgr->>Analyzer: Spawn with run_log
        Analyzer->>Analyzer: Evaluate implementation
        Analyzer->>PipelineMgr: Verdict

        alt Verdict = Followup
            PipelineMgr->>Impl: Relaunch with followup prompt
            Note over Impl: Loop back to Stage 1
        else Verdict = Failed
            PipelineMgr->>PipelineMgr: Block pipeline
        else Verdict = Complete
            Note over PipelineMgr: Proceed to Stage 3
        end
    end

    rect rgb(230, 200, 200)
        Note over PipelineMgr,QA: Stage 3: QA
        PipelineMgr->>QA: Spawn test runner
        QA->>PipelineMgr: Test results

        alt Tests fail
            PipelineMgr->>Impl: Retry implementation
        else Tests pass
            Note over PipelineMgr: Proceed to Stage 4
        end
    end

    rect rgb(230, 230, 200)
        Note over PipelineMgr,Merger: Stage 4: Merge
        PipelineMgr->>Merger: Spawn merger
        Merger->>Merger: git merge
        Merger->>PipelineMgr: Merge result
        PipelineMgr->>User: Pipeline Complete
    end
```

## Key Characteristics

| Aspect | Description |
|--------|-------------|
| **Pattern** | Sequential state machine with conditional feedback loops |
| **Trigger** | Idea approval or manual invocation |
| **Progression** | Verdict-driven (Complete/Followup/Failed) |
| **Retry** | Per-stage attempt tracking with max retries |
| **Isolation** | Git worktree per pipeline for branch isolation |
| **Persistence** | JSON state files in `.state/pipelines/` |
