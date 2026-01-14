# Business Roadmap

> **Vision**: AI-powered software development company that delivers projects faster and cheaper than traditional agencies, progressively increasing autonomy as results prove out.
>
> *"The competitive advantage is AI-augmented delivery. Win bids others can't, deliver faster than anyone else."*

**Related:** [Product Roadmap](product_roadmap.md)

---

## The Mechanism: Spec-Driven Development

**How we achieve the vision**: The next abstraction jump in software development.

| Era | Human Writes | Machine Handles |
|-----|--------------|-----------------|
| 1950s | Assembly | — |
| 1970s | C | Assembly |
| 2000s | JavaScript | Memory management |
| 2025+ | **Specs (English)** | **All code** |

While competitors build "AI coding assistants" (Copilot, Cursor, Devin), we build the platform where **specs are the source of truth** and code is a generated artifact.

**This is how we win bids others can't**: We don't just write code faster—we eliminate code as a human concern.

---

## The Hybrid Model

Nolan is a **spec-driven software delivery platform** that powers a software development company. The strategy: start as an internal tool, prove spec-to-code works, establish a track record, and progressively shift from AI-augmented to AI-native.

### Transition Path

| Phase | Focus | Key Outcome | Human Role | AI Role |
|-------|-------|-------------|------------|---------|
| **1. Internal Tool** | Efficiency | 2-3x faster delivery | Write code, review AI | Assist coding |
| **2. Spec Foundation** | Spec layer | Specs → auto-plans | Write specs, review plans | Generate plans from specs |
| **3. Spec-First** | Spec execution | Specs → auto-code | Approve specs, review code | Generate code from specs |
| **4. Autonomous** | Full autonomy | Specs → deployed software | Approve specs only | Everything else |

### The Competitive Flywheel

```
Win bid (cheaper) → Deliver fast → Build reputation → Win more bids
      ↑                                                      |
      +------------- Improve estimation accuracy <-----------+
```

### The Spec-Driven Flywheel (How We Deliver)

```
Write spec → AI generates plan → AI implements → AI validates → Ship
     ↑                                                          |
     +---------- Learnings improve spec templates <-------------+
```

The competitive flywheel is **what** we do. The spec-driven flywheel is **how** we do it faster than anyone else.

### Competitive Positioning

| Competitor | Their Approach | Our Approach |
|------------|----------------|--------------|
| **Copilot/Cursor** | AI helps write code | AI replaces code writing |
| **Devin** | AI agent writes code | Specs are source of truth |
| **Traditional Agencies** | Humans write code | Specs → auto-code |

**Why we win**: Others optimize for "writing code faster." We eliminate code as a human concern.

### Business Math

**Traditional Agency (500 hour project):**
- Labor cost: $50,000 (at $100/hr internal)
- Client price: $75,000 (at $150/hr)
- Margin: $25,000 (33%)
- Delivery: 12 weeks

**Phase 2: Spec Foundation (specs → plans auto-generated):**
- Human hours: 150 (spec writing + code review)
- AI hours: 350 (planning + implementation)
- Total cost: $15,000 (labor) + $7,000 (AI) = $22,000
- Client price: $50,000 (undercut 33%)
- Margin: $28,000 (56%)
- Delivery: 4 weeks

**Phase 4: Spec-First Autonomous (specs → deployed software):**
- Human hours: 30 (spec approval only)
- AI hours: 470 (everything else)
- Total cost: $3,000 (labor) + $10,000 (AI) = $13,000
- Client price: $35,000 (undercut 53%)
- Margin: $22,000 (63%)
- Delivery: 1-2 weeks

---

### The Self-Development Advantage

**Unique to Nolan**: The platform can develop itself.

```
┌─────────────────────────────────────────────────────┐
│  1. Write spec for Nolan feature                    │
│               ↓                                     │
│  2. Nolan's agents implement the spec               │
│               ↓                                     │
│  3. New capability added to Nolan                   │
│               ↓                                     │
│  4. Better spec tooling → faster spec writing       │
│               ↓                                     │
│  5. Return to step 1 (accelerating cycle)           │
└─────────────────────────────────────────────────────┘
```

**Business impact**: R&D costs approach zero as Nolan matures. Competitors must pay humans to improve their tools. We write specs.

---

## Terminology: Phases vs Priorities

| Term | What It Means | Example |
|------|---------------|---------|
| **Transition Phase** (1-4) | Business maturity stage | "Phase 2: Spec Foundation" |
| **Product Phase** (0-6) | Technical feature set | "Product Phase 6: Spec-Driven Development" |

**Mapping:**
- Transition Phase 1 (Internal Tool) → Product Phases 0-3 (current)
- Transition Phase 2 (Spec Foundation) → Product Phase 6.1
- Transition Phase 3 (Spec-First) → Product Phases 6.2-6.4
- Transition Phase 4 (Autonomous) → Product Phase 6.5

---

## Current Team Structure

### Default Team (Core Workflow)

One team currently handles all projects:

| Agent | Role | Output |
|-------|------|--------|
| **Ana** | Researcher | research.md |
| **Bill** | Planner | plan.md |
| **Enzo** | Plan Reviewer | plan-review.md |
| **Carl** | Implementer | progress.md |
| **Frank** | Auditor | implementation-audit.md |
| **Dan** | Coordinator | NOTES.md |
| **Guardian** | Exception Handler | (escalations) |

**Workflow**: Ana → Bill → Enzo → Carl → Frank (with Dan coordinating)

### Cronos Agents (Background Tasks)

| Agent | Purpose |
|-------|---------|
| cron-idea-processor | Analyzes ideas, creates proposals |
| cron-idea-merger | Consolidates related ideas |
| cron-idea-implementer | Creates projects from approved ideas |
| cron-roadmap | Updates roadmaps from activity |
| cron-roadmap-alignment | Validates roadmap alignment |
| cron-git-commit | Automated commits |
| cron-workflow-monitor | Tracks workflow health |
| cron-dependency-check | Validates dependencies |
| cron-security-audit | Security scanning |
| cron-bug-finder | Identifies bugs in codebase |
| cron-ui-audit | UI/UX audit and improvements |
| cron-code-indexer | Indexes codebase for context |

### Future: Organizational Structure

A future organizational structure is documented in `teams/org.md` with departments (CORP, HR, DEV, INFRA, BIZ, QA) and ~23 teams. This is **not yet implemented** - currently all work flows through the default team.

---

## Project Type Templates

Nolan supports four project types. Each has specific estimation patterns and delivery workflows.

### Web Applications

**Scope:** Frontend + backend, user authentication, data storage, deployment

| Component | Traditional Hours | AI-Augmented | AI Leverage |
|-----------|------------------|--------------|-------------|
| UI/UX Design | 40 | 25 | 40% |
| Frontend Development | 120 | 45 | 65% |
| Backend API | 80 | 30 | 65% |
| Database Design | 20 | 10 | 50% |
| Authentication | 30 | 10 | 70% |
| Testing | 60 | 15 | 75% |
| Documentation | 30 | 5 | 85% |
| Deployment/DevOps | 20 | 8 | 60% |
| **Total** | **400** | **148** | **63%** |

**Quality Gates:**
- [ ] Responsive design verified
- [ ] Authentication/authorization tested
- [ ] Performance benchmarks met
- [ ] Security scan passed
- [ ] Accessibility (WCAG 2.1) compliance

---

### APIs and Integrations

**Scope:** REST/GraphQL APIs, third-party integrations, data pipelines

| Component | Traditional Hours | AI-Augmented | AI Leverage |
|-----------|------------------|--------------|-------------|
| API Design | 20 | 10 | 50% |
| Endpoint Implementation | 60 | 20 | 70% |
| Data Validation | 30 | 8 | 75% |
| Third-Party Integration | 40 | 25 | 40% |
| Error Handling | 20 | 6 | 70% |
| Testing | 40 | 10 | 75% |
| Documentation | 30 | 5 | 85% |
| **Total** | **240** | **84** | **65%** |

**Quality Gates:**
- [ ] OpenAPI/GraphQL schema validated
- [ ] Rate limiting configured
- [ ] Authentication tokens secure
- [ ] Integration tests passing
- [ ] API documentation complete

---

### Mobile Applications

**Scope:** iOS, Android, or cross-platform (React Native, Flutter)

| Component | Traditional Hours | AI-Augmented | AI Leverage |
|-----------|------------------|--------------|-------------|
| UI/UX Design | 50 | 30 | 40% |
| Core App Logic | 100 | 40 | 60% |
| Platform-Specific Code | 60 | 35 | 45% |
| Backend Integration | 40 | 15 | 65% |
| Offline/Sync Logic | 30 | 15 | 50% |
| Testing | 50 | 15 | 70% |
| App Store Submission | 20 | 12 | 40% |
| **Total** | **350** | **162** | **54%** |

**Quality Gates:**
- [ ] iOS and Android builds successful
- [ ] App store guidelines compliance
- [ ] Performance on target devices
- [ ] Offline functionality tested
- [ ] Push notifications working

---

### Custom Enterprise Systems

**Scope:** Large-scale custom systems, ERP extensions, complex workflows

| Component | Traditional Hours | AI-Augmented | AI Leverage |
|-----------|------------------|--------------|-------------|
| Requirements Analysis | 60 | 40 | 35% |
| Architecture Design | 80 | 50 | 40% |
| Core Implementation | 200 | 80 | 60% |
| Legacy Integration | 80 | 60 | 25% |
| Data Migration | 60 | 40 | 35% |
| Business Logic | 100 | 50 | 50% |
| Testing | 80 | 25 | 70% |
| Documentation | 40 | 8 | 80% |
| Training Materials | 20 | 5 | 75% |
| **Total** | **720** | **358** | **50%** |

**Quality Gates:**
- [ ] All business rules verified
- [ ] Legacy system integration tested
- [ ] Data migration validated
- [ ] User acceptance testing passed
- [ ] Disaster recovery documented

---

## Business Success Metrics

### Efficiency Metrics

| Metric | Current | Phase 1 Target | Phase 4 Target |
|--------|---------|----------------|----------------|
| Hours per story point | Untracked | Baseline established | 50% reduction |
| Estimate accuracy | Untracked | +/- 30% | +/- 15% |
| Rework rate | Untracked | < 20% | < 10% |
| Delivery vs quoted | Untracked | Within 120% | Within 100% |

### Competitive Metrics

| Metric | Current | Phase 2 Target | Phase 4 Target |
|--------|---------|----------------|----------------|
| Bid win rate | Baseline | +20% vs baseline | +50% vs baseline |
| Price vs market | Market rate | -15% undercut | -40% undercut |
| Client acceptance | Untracked | 85% | 95% |

### Autonomy Metrics

| Metric | Current | Phase 1 Target | Phase 4 Target |
|--------|---------|----------------|----------------|
| Human:AI hour ratio | Unknown | 60:40 | 10:90 |
| Projects < 20% human | 0% | 10% | 75% |
| Revenue per employee | Baseline | +50% | +200% |

---

## Feature Roadmap

Features organized by business goal. All features are implemented by the **default team** (Ana, Bill, Enzo, Carl, Frank).

### Delivery Efficiency

**Goal:** Deliver projects faster with fewer hours

#### Delivery Tracking (IMMEDIATE)

**Current State:** Usage tracking per session/project exists, session duration tracked
**Gap:** No phase-level time aggregation; no hours/story point metric

**Target:**
- [ ] Session time captured automatically
- [ ] Phase-level and project-level aggregation
- [ ] Hours per story point trending

#### Delivery Metrics Dashboard (NEAR-TERM)

**Target:**
- [ ] Hours per story point metric
- [ ] Velocity trending over time
- [ ] Bottleneck detection per phase

---

### Competitive Intelligence

**Goal:** Estimate accurately, bid confidently

#### Estimation Engine (NEAR-TERM)

**Current State:** No estimation tooling, manual estimates only

**Target:**
- [ ] Story point estimation based on requirement complexity
- [ ] Historical data lookup (similar past projects)
- [ ] Confidence intervals on estimates
- [ ] Project type templates (web, API, mobile, enterprise)

#### Actual vs Estimate Tracking (NEAR-TERM)

**Target:**
- [ ] Per-project estimate vs actual comparison
- [ ] Variance analysis
- [ ] Feedback loop to improve estimation model

#### Bid Analyzer (DEFERRED)

**Target:**
- [ ] Document parser for common RFP formats
- [ ] Requirement extraction and categorization
- [ ] Quote generation with line items

---

### Quality Assurance

**Goal:** Prove work meets standards, maintain audit trails

#### Quality Gate Enforcement (IMMEDIATE)

**Current State:** Phase-gate with manual QA exists, stop hooks for phase validation exist
**Gap:** No configurable quality thresholds

**Target:**
- [ ] Configurable quality thresholds per project type
- [ ] Quality score per project
- [ ] Block handoff on quality failure

#### Decision Audit Trail (IMMEDIATE)

**Current State:** Session history in JSONL files
**Gap:** No decision capture hook; no decision timeline UI

**Target:**
- [ ] Structured decision log per project
- [ ] Rationale capture for key decisions
- [ ] Queryable decision history
- [ ] Export for public contract compliance

#### Client Deliverables Packaging (NEAR-TERM)

**Target:**
- [ ] Export templates (documentation, code, reports)
- [ ] Deliverable checklist per project type
- [ ] Version-controlled deliverable history

#### Approval Workflow (NEAR-TERM)

**Target:**
- [ ] Decision classification (low/medium/high risk)
- [ ] Approval workflow for client-facing outputs
- [ ] Approval history tracking

---

### Autonomous Scaling

**Goal:** Reduce human ratio per project, scale without hiring

#### Human Ratio Tracking (IMMEDIATE)

**Current State:** Usage tracking exists for tokens/cost
**Gap:** No human vs AI hours distinction

**Target:**
- [ ] Human:AI ratio calculated per project
- [ ] Autonomy score visible
- [ ] Trends over time trackable

#### Exception Escalation (IMMEDIATE)

**Current State:** Default policy includes escalation rules (timeout: 30m, budget exceeded, quality failed)
**Gap:** No automatic trigger; no escalation workflow UI

**Target:**
- [ ] Automatic trigger on timeout/budget/quality failures
- [ ] Escalation workflow with notification
- [ ] Resolution tracking

#### Cost Tracking & Margin Analysis (NEAR-TERM)

**Current State:** Token costs tracked per session
**Gap:** No labor cost integration; no margin calculation

**Target:**
- [ ] Human labor cost tracking
- [ ] AI cost tracking (tokens)
- [ ] Margin calculation per project
- [ ] Budget monitoring and alerts

---

## Feature Dependencies

```
Delivery Efficiency
    Delivery Tracking ───────┬──→ Metrics Dashboard
                             │
                             └──→ Estimation Engine ──→ Actual vs Estimate
                                                    │
                                                    └──→ Bid Analyzer

Quality Assurance
    Quality Gates ──────┬──→ Client Deliverables
    Decision Audit ─────┴──→ Approval Workflow

Autonomous Scaling
    Human Ratio ────────┬──→ Cost Tracking
    Exception Escalation
```

**Implementation Order:**
1. IMMEDIATE: Delivery Tracking, Quality Gates, Decision Audit, Human Ratio, Exception Escalation
2. NEAR-TERM: Metrics Dashboard, Estimation Engine, Actual vs Estimate, Client Deliverables, Approval Workflow, Cost Tracking
3. DEFERRED: Bid Analyzer

---

## Risks

### General Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | High | High | Strict milestone boundaries |
| Estimation inaccuracy | High | Medium | Track actuals, iterate model |
| Quality escapes | Medium | High | Security in QA workflow |
| Client trust | Medium | High | Start with internal, prove results |
| AI cost increases | Medium | Medium | Track margins, adjust pricing |

### Phase 6 (Spec-Driven) Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Specs lack sufficient detail | High | High | Iterative spec refinement, gap detection |
| AI generates incorrect implementations | Medium | High | Frank audits against spec, test generation |
| Spec-to-code gap larger than expected | Medium | Medium | Start with simple specs, measure accuracy |
| Users resist spec-first workflow | Medium | Medium | Gradual transition, prove value on internal projects |
| Spec versioning becomes complex | Low | Medium | Simple versioning first, iterate as needed |
