# Team Pipeline Coordination

**File:** `src-tauri/src/scheduler/team_pipeline.rs`

Team Pipelines orchestrate multi-phase workflows defined in `team.yaml`. Unlike the 3-stage Agent Pipeline, Team Pipelines dynamically create stages based on workflow phase definitions, with each phase having an execution and validation sub-stage.

## Phase Structure

Each phase from `team.yaml` is expanded into two sub-stages:

```mermaid
flowchart LR
    subgraph Phase["Each Team Phase"]
        Exec[Phase Execution<br/>owner agent runs]
        Valid[Phase Validation<br/>validator checks output]
        Exec --> Valid
    end
```

## Team Pipeline State Machine

```mermaid
stateDiagram-v2
    direction TB

    [*] --> Phase1_Exec: Pipeline Created

    state "Phase 1: Research" as Phase1 {
        state "Execution" as Phase1_Exec
        state "Validation" as Phase1_Valid

        Phase1_Exec --> Phase1_Valid: success
        Phase1_Valid --> Phase1_Exec: Revision verdict
    }

    state "Phase 2: Design" as Phase2 {
        state "Execution" as Phase2_Exec
        state "Validation" as Phase2_Valid

        Phase2_Exec --> Phase2_Valid: success
        Phase2_Valid --> Phase2_Exec: Revision verdict
    }

    state "Phase N: Implementation" as PhaseN {
        state "Execution" as PhaseN_Exec
        state "Validation" as PhaseN_Valid

        PhaseN_Exec --> PhaseN_Valid: success
        PhaseN_Valid --> PhaseN_Exec: Revision verdict
    }

    Phase1_Valid --> Phase2_Exec: Complete verdict
    Phase2_Valid --> PhaseN_Exec: Complete verdict

    Phase1_Valid --> Escalate: Failed verdict
    Phase2_Valid --> Escalate: Failed verdict
    PhaseN_Valid --> Escalate: Failed verdict

    PhaseN_Valid --> Complete: Complete verdict (last phase)

    Complete --> [*]
    Escalate --> [*]: awaits human
```

## Verdict-Driven Transitions

Phase Validators produce one of three verdicts:

```mermaid
flowchart TB
    subgraph Verdicts["Phase Verdicts"]
        Complete["Complete<br/>Phase output is satisfactory"]
        Revision["Revision<br/>Needs rework with feedback"]
        Failed["Failed<br/>Cannot proceed automatically"]
    end

    subgraph Actions["Resulting Actions"]
        NextPhase["Trigger Next Phase<br/>or Complete Pipeline"]
        RetryPhase["Retry Current Phase<br/>with revision prompt"]
        Escalate["Escalate to Human<br/>manual intervention needed"]
    end

    Complete --> NextPhase
    Revision --> RetryPhase
    Failed --> Escalate
```

## Data Structure

```mermaid
classDiagram
    class TeamPipeline {
        +String id
        +String team_name
        +String project_name
        +String docs_path
        +PipelineStatus status
        +Vec~TeamPipelineStage~ stages
        +String current_phase
        +TeamPipelineStageType current_stage_type
        +Vec~PipelineEvent~ events
    }

    class TeamPipelineStage {
        +String phase_name
        +TeamPipelineStageType stage_type
        +PipelineStageStatus status
        +String agent_name
        +Option~PhaseVerdict~ verdict
        +Option~String~ output_file
        +u32 attempt
    }

    class PhaseVerdict {
        +PhaseVerdictType verdict
        +String reason
        +Vec~String~ findings
        +Option~String~ revision_prompt
    }

    class TeamPipelineStageType {
        <<enumeration>>
        PhaseExecution
        PhaseValidation
    }

    class PhaseVerdictType {
        <<enumeration>>
        Complete
        Revision
        Failed
    }

    class TeamPipelineNextAction {
        <<enumeration>>
        TriggerValidator
        TriggerNextPhase
        RetryPhase
        EscalateToHuman
        Complete
    }

    TeamPipeline "1" --> "*" TeamPipelineStage
    TeamPipelineStage --> PhaseVerdict
    TeamPipelineStage --> TeamPipelineStageType
    PhaseVerdict --> PhaseVerdictType
```

## Coordination Sequence

```mermaid
sequenceDiagram
    participant User
    participant TeamMgr as Team Pipeline Manager
    participant Owner as Phase Owner Agent
    participant Validator as Phase Validator Agent

    User->>TeamMgr: Launch Team Workflow (project)
    TeamMgr->>TeamMgr: Create pipeline from team.yaml phases

    loop For each phase
        rect rgb(200, 230, 200)
            Note over TeamMgr,Owner: Phase Execution
            TeamMgr->>Owner: Spawn with phase context
            Owner->>Owner: Work on phase task
            Owner-->>TeamMgr: Output file created
            Owner->>TeamMgr: Exit success
        end

        rect rgb(200, 200, 230)
            Note over TeamMgr,Validator: Phase Validation
            TeamMgr->>Validator: Spawn with output file
            Validator->>Validator: Evaluate phase output
            Validator->>TeamMgr: PhaseVerdict

            alt Verdict = Revision
                TeamMgr->>TeamMgr: Generate revision prompt
                TeamMgr->>Owner: Retry phase with feedback
                Note over Owner: Loop back to execution
            else Verdict = Failed
                TeamMgr->>User: Escalate - manual intervention needed
            else Verdict = Complete
                Note over TeamMgr: Proceed to next phase
            end
        end
    end

    TeamMgr->>User: Pipeline Complete
```

## Dynamic Phase Expansion Example

Given a `team.yaml` like:

```yaml
workflow:
  phases:
    - name: research
      owner: researcher
      output: research.md
    - name: design
      owner: architect
      output: design.md
    - name: implement
      owner: implementer
      output: code changes
```

The Team Pipeline creates 6 stages:

```mermaid
flowchart LR
    subgraph Research["Phase: research"]
        R1[Execution<br/>agent: researcher]
        R2[Validation<br/>agent: phase-validator]
        R1 --> R2
    end

    subgraph Design["Phase: design"]
        D1[Execution<br/>agent: architect]
        D2[Validation<br/>agent: phase-validator]
        D1 --> D2
    end

    subgraph Implement["Phase: implement"]
        I1[Execution<br/>agent: implementer]
        I2[Validation<br/>agent: phase-validator]
        I1 --> I2
    end

    R2 -->|Complete| D1
    D2 -->|Complete| I1
    I2 -->|Complete| Done((Done))
```

## Key Differences from Agent Pipeline

| Aspect | Agent Pipeline | Team Pipeline |
|--------|----------------|---------------|
| **Stages** | Configurable (e.g., 3 stages) | Dynamic from team.yaml |
| **Structure** | Linear with feedback | Nested (exec+validate per phase) |
| **Agents** | Role-typed (e.g., Impl/Analyzer/Merger) | Phase owners + validator |
| **Output** | Code changes | Phase output files |
| **Scope** | Single feature | Multi-phase project |
| **Verdict Types** | Complete/Revision/Failed | Complete/Revision/Failed |

## Key Characteristics

| Aspect | Description |
|--------|-------------|
| **Pattern** | Hierarchical state machine (phases → sub-stages) |
| **Trigger** | Team workflow launch command |
| **Progression** | Verdict-driven (Complete/Revision/Failed) |
| **Dynamic** | Stages created from team.yaml at runtime |
| **Persistence** | JSON state files in `.state/team-pipelines/` |
| **Escalation** | Failed verdict triggers human intervention |
