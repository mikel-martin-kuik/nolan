# Nolan Roadmap

> **Vision**: AI-powered software development company that delivers projects faster and cheaper than traditional agencies, progressively increasing autonomy as results prove out.
>
> *"Win bids others can't. Deliver faster than anyone else."*

---

## The Mechanism: Spec-Driven Development

**How we achieve the vision**: The next abstraction jump.

| Era | Human Writes | Machine Handles |
|-----|--------------|-----------------|
| 1950s | Assembly | — |
| 1970s | C | Assembly |
| 2000s | JavaScript | Memory, low-level ops |
| 2025+ | **Specs (English)** | **All code** |

Nolan is the platform for this transition:
- **Specs are the source of truth** (not code)
- **AI agents execute specs** (not humans writing code)
- **Nolan can develop itself** (specs → implementation → better spec tooling)

This is how we win: We don't just write code faster—we eliminate code as a human concern.

---

## Roadmap Documents

| Document | Focus | Description |
|----------|-------|-------------|
| [Business Roadmap](business_roadmap.md) | Strategy & Market | How we win - business goals, project templates, metrics, feature roadmap |
| [Product Roadmap](product_roadmap.md) | Features & Technical | What we build - phases 0-6, architecture, current state |

---

## Quick Reference

> **Note**: This roadmap uses three numbering systems:
> - **Transition Phases** (1-4): Business maturity (Internal Tool → Autonomous)
> - **Product Phases** (0-6): Technical features we build
> - **Priority Tiers**: When we build (IMMEDIATE, NEAR-TERM, DEFERRED)

### Product Phases (0-6)

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 0: Architecture | Complete | 100% |
| Phase 1: Cost & Execution | Mostly Complete | 98% |
| Phase 2: Safety & Versioning | Not Started | 0% |
| Phase 3: Context & Communication | Complete | 100% |
| Phase 4: Autonomy & Scale | In Progress | 55% |
| Phase 5: Enterprise | Not Started | 0% |
| **Phase 6: Spec-Driven Development** | In Progress | 15% |

### Transition Phases

| Phase | Focus | Human Role |
|-------|-------|------------|
| 1. Internal Tool | Efficiency | Write code, review AI |
| 2. Spec Foundation | Spec layer | Write specs, review plans |
| 3. Spec-First | Spec execution | Approve specs, review code |
| 4. Autonomous | Full autonomy | Approve specs only |

---

## Current Team Structure

### Default Team (Core Workflow)

One team executes all projects using a phase-gate workflow:

| Agent | Role | Output |
|-------|------|--------|
| **Ana** | Researcher | research.md |
| **Bill** | Planner | plan.md |
| **Enzo** | Plan Reviewer | plan-review.md |
| **Carl** | Implementer | progress.md |
| **Frank** | Auditor | implementation-audit.md |
| **Dan** | Coordinator | NOTES.md |
| **Guardian** | Exception Handler | (escalations) |

**Workflow**: Ana → Bill → Enzo → Carl → Frank

### Cronos Agents (Background Tasks)

| Agent | Purpose | Status |
|-------|---------|--------|
| cron-idea-processor | Analyzes ideas, creates proposals | Active |
| cron-idea-merger | Consolidates related ideas | Active |
| cron-idea-implementer | Creates projects from approved ideas | In Development |
| cron-roadmap | Updates roadmaps from activity | Active |
| cron-git-commit | Automated commits | Active |
| cron-workflow-monitor | Tracks workflow health | Active |
| cron-dependency-check | Validates dependencies | Planned |

---

## What Nolan Replaces

| Old Tool | Nolan Equivalent | Key Difference |
|----------|------------------|----------------|
| **VSCode** | Agent workspace | No code editing—spec editing |
| **Jira** | Projects + Ideas | Specs are tickets, AI executes them |
| **GitHub Issues** | Support/Ideas | Natural language, AI-triaged |
| **GitHub PRs** | Workflow phases | AI review, not human review |
| **Confluence** | Spec repository | Living docs that generate code |
| **CI/CD** | Cronos + Agents | Continuous development, not just delivery |

---

## The Self-Development Loop

Nolan's unique advantage: it can build itself.

```
┌────────────────────────────────────────────────────┐
│                                                     │
│   1. You write spec for Nolan feature              │
│              ↓                                      │
│   2. Nolan's agents implement it                   │
│              ↓                                      │
│   3. New capability added to Nolan                 │
│              ↓                                      │
│   4. Better spec tooling enables faster specs      │
│              ↓                                      │
│   5. Return to step 1 (accelerating cycle)         │
│                                                     │
└────────────────────────────────────────────────────┘
```

No traditional dev tool has this property. VSCode can't improve itself from specs. Jira can't auto-execute tickets. Nolan can.
