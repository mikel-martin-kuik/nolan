# Spec-Driven Architecture

> **Status**: Phase 6 - In Progress (20%)
>
> This document describes Nolan's evolution toward spec-driven development, where specifications in natural language become the source of truth and code becomes a generated artifact.

## Core Concept

```mermaid
flowchart TB
    subgraph Input["Human Input"]
        Idea[Idea<br/>Natural language request]
    end

    subgraph SpecLayer["Spec Layer"]
        Proposal[Proposal<br/>AI-analyzed with gaps identified]
        Spec[Specification<br/>Formal requirements document]
    end

    subgraph Execution["Manufacturing Line"]
        Plan[Plan Generation]
        Impl[Implementation]
        Validate[Validation against Spec]
    end

    subgraph Output["Output"]
        Code[Generated Code]
    end

    Idea --> Proposal
    Proposal -->|User accepts| Spec
    Spec --> Plan
    Plan --> Impl
    Impl --> Validate
    Validate -->|Pass| Code
    Validate -->|Fail| Impl
```

## The Abstraction Jump

| Era | Human Writes | Machine Handles |
|-----|--------------|-----------------|
| 1950s | Assembly | - |
| 1970s | C | Assembly |
| 2000s | JavaScript | Memory, low-level ops |
| 2025+ | **Specs (English)** | **All code** |

Nolan is the platform for this transition. Specs are not documentation - they are executable instructions.

## Current Implementation

### Ideas System (Implemented)

The foundation for spec-driven development exists:

```
~/.nolan/
├── ideas.jsonl           # User-submitted ideas
├── inbox-reviews.jsonl   # AI-generated proposals
└── projects/             # Created from approved ideas
```

**Current Flow:**
```mermaid
flowchart LR
    Idea --> |idea-processor| Proposal
    Proposal --> |User accepts| Project
    Project --> |idea-implementer| Worktree
    Worktree --> |Pipeline| Code
```

**Agents involved:**
- `idea-processor`: Analyzes ideas, identifies gaps, creates proposals
- `idea-merger`: Consolidates related ideas
- `idea-implementer`: Creates projects from approved ideas

### Gap: The Spec Layer

Currently, proposals go directly to projects. The missing layer:

```mermaid
flowchart LR
    Proposal --> |MISSING| Spec
    Spec --> Project
```

## Target Architecture

### Spec as First-Class Entity

```mermaid
classDiagram
    class Specification {
        +String id
        +String title
        +String overview
        +Vec~Requirement~ requirements
        +Vec~AcceptanceCriterion~ acceptance_criteria
        +Vec~String~ dependencies
        +Scope scope
        +Vec~String~ implementation_hints
        +DateTime created_at
        +u32 version
    }

    class Requirement {
        +RequirementType type
        +String description
        +Priority priority
    }

    class RequirementType {
        <<enumeration>>
        Functional
        NonFunctional
        Constraint
    }

    class AcceptanceCriterion {
        +String id
        +String description
        +bool testable
        +Option~String~ test_command
    }

    class Scope {
        +Vec~String~ includes
        +Vec~String~ excludes
    }

    Specification "1" --> "*" Requirement
    Specification "1" --> "*" AcceptanceCriterion
    Specification "1" --> "1" Scope
    Requirement --> RequirementType
```

### Spec Format

```markdown
# Specification: {Title}

## Overview
{One-sentence summary}

## Requirements
### Functional
- {requirement with priority}

### Non-Functional
- {performance, security, etc.}

### Constraints
- {limitations, must-use technologies}

## Acceptance Criteria
1. [ ] {criterion with testable condition}
2. [ ] {criterion with testable condition}

## Dependencies
- Projects: {related projects}
- Components: {existing code paths}

## Scope
### Includes
- {features in scope}

### Excludes
- {features explicitly out of scope}

## Implementation Hints
{code paths, patterns, relevant files}
```

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant IdeaProcessor as idea-processor
    participant SpecGenerator as spec-generator
    participant SpecReviewer as spec-reviewer
    participant Pipeline as Manufacturing Line

    User->>IdeaProcessor: Submit idea
    IdeaProcessor->>IdeaProcessor: Analyze, identify gaps
    IdeaProcessor-->>User: Proposal with gaps

    User->>SpecGenerator: Accept proposal
    SpecGenerator->>SpecGenerator: Generate formal spec
    SpecGenerator-->>SpecReviewer: spec.md

    SpecReviewer->>SpecReviewer: Review completeness

    alt Spec incomplete
        SpecReviewer-->>User: Request clarification
    else Spec complete
        SpecReviewer-->>Pipeline: Approved spec
        Pipeline->>Pipeline: Execute (Plan → Implement → Validate)
        Pipeline-->>User: Generated code
    end
```

## Implementation Phases

### 6.1 Spec Layer (Foundation)

**Goal**: Formal specifications between ideas and projects.

**New Artifacts:**
- `spec.md` in project template
- `spec-generator` agent
- Spec review workflow phase

**Changes:**
- [ ] Add `spec.md` to project template
- [ ] Create `spec-generator` agent (proposal → spec)
- [ ] Add spec review phase to default team workflow
- [ ] Update Bill (Planner) to read from spec
- [ ] Update Frank (Auditor) to validate against spec

### 6.2 Spec as Contract

**Goal**: Specs become authoritative. Code validates against specs.

**Features:**
- Spec versioning (track changes)
- Spec diff tracking
- Compliance validation
- Spec-to-test generation

**Workflow:**
```mermaid
flowchart LR
    Change[Spec Change] --> Impact[Impact Analysis]
    Impact --> Replan[Re-plan]
    Replan --> Reimpl[Re-implement]
    Reimpl --> Revalidate[Re-validate]
```

### 6.3 Spec Composition

**Goal**: Complex features decompose into composable specs.

**Spec Dependencies:**
```yaml
spec: user-auth
  requires: [database, session-management]

spec: admin-dashboard
  requires: [user-auth, analytics]
```

**Features:**
- Spec dependency graph
- Cross-project impact analysis
- Capacity planning from spec complexity
- Spec templates for common patterns

### 6.4 Natural Language Interface

**Goal**: Conversation as primary spec creation interface.

**Target Interaction:**
```
User: "I want users to export their data as CSV"

Nolan:
├── Searches existing specs for related features
├── Identifies affected components
├── Generates draft spec with gaps highlighted
├── Shows impact on current roadmap
└── Asks: "Shall I create this spec?"
```

### 6.5 Self-Development Loop

**Goal**: Nolan develops itself through specs.

```mermaid
flowchart TB
    A[Write spec for Nolan feature] --> B[Nolan agents implement spec]
    B --> C[New capability added]
    C --> D[Better spec tooling]
    D --> A
```

**Validation**: Nolan can accept and execute specs for its own features.

## Integration with Manufacturing Line

The spec layer integrates with existing architecture:

```mermaid
flowchart TB
    subgraph SpecLayer["Spec Layer (New)"]
        Idea --> Proposal --> Spec
    end

    subgraph Existing["Manufacturing Line (Existing)"]
        Spec --> Ana[Ana: Research]
        Ana --> Bill[Bill: Plan from Spec]
        Bill --> Enzo[Enzo: Review Plan]
        Enzo --> Carl[Carl: Implement]
        Carl --> Frank[Frank: Audit vs Spec]
    end
```

**Key Integration Points:**
- Bill reads spec (not just research) to generate plan
- Frank validates implementation against spec acceptance criteria
- Pipeline Manager tracks spec compliance status

## File Structure

```
~/.nolan/
├── ideas.jsonl              # Ideas (existing)
├── inbox-reviews.jsonl      # Proposals (existing)
├── specs/                   # NEW: Spec storage
│   ├── {spec-id}.md
│   └── {spec-id}.meta.json  # Version, status, dependencies
└── projects/
    └── {project}/
        ├── spec.md          # NEW: Project's spec
        ├── research.md
        ├── plan.md
        └── ...
```

## Metrics

| Metric | Current | Phase 6.1 Target | Phase 6.5 Target |
|--------|---------|------------------|------------------|
| Specs auto-generated from ideas | 0% | 80% | 100% |
| Plans reference spec requirements | 0% | 100% | 100% |
| Audits validate against spec | 0% | 100% | 100% |
| End-to-end spec execution | 0% | 50% | 95% |

## Risks

| Risk | Mitigation |
|------|------------|
| Specs lack detail | Iterative refinement, gap detection |
| AI generates incorrect implementations | Audit against spec acceptance criteria |
| Spec versioning complexity | Start simple, iterate |
| Users resist spec-first workflow | Prove value on internal projects first |
