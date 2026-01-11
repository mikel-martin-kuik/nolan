# Business Roadmap

> **Vision**: AI-powered software development company that delivers projects faster and cheaper than traditional agencies, progressively increasing autonomy as results prove out.
>
> *"The competitive advantage is AI-augmented delivery. Win bids others can't, deliver faster than anyone else."*

**Related:** [Product Roadmap](product_roadmap.md)

---

## The Hybrid Model

Nolan is an **AI-augmented software delivery platform** that powers a software development company. The strategy is to start as an internal tool, build a competitive moat, establish a track record, and progressively increase autonomy.

### Transition Path

| Phase | Focus | Key Outcome | Human:AI Ratio | Timeline |
|-------|-------|-------------|----------------|----------|
| **1. Internal Tool** | Efficiency | 2-3x faster delivery | 90:10 | Now - 6mo |
| **2. Competitive Moat** | Market position | Win bids others can't | 60:40 | 6mo - 18mo |
| **3. Track Record** | Credibility | Proven results, case studies | 30:70 | 18mo - 36mo |
| **4. Autonomous** | Transformation | Software company run by AI | 10:90 | 36mo+ |

### Competitive Flywheel

```
Win bid (cheaper) -> Deliver fast -> Build reputation -> Win more bids
      ^                                                      |
      +------------- Improve estimation accuracy <-----------+
```

### Business Math

**Traditional Agency (500 hour project):**
- Labor cost: $50,000 (at $100/hr internal)
- Client price: $75,000 (at $150/hr)
- Margin: $25,000 (33%)
- Delivery: 12 weeks

**Phase 1-2: AI-Augmented (60% AI leverage):**
- Human hours: 200 (AI handles 60%)
- Total cost: $20,000 (labor) + $5,000 (AI) = $25,000
- Client price: $55,000 (undercut 27%)
- Margin: $30,000 (55%)
- Delivery: 5 weeks

**Phase 4: Autonomous (90% AI leverage):**
- Human hours: 50 (oversight only)
- Total cost: $5,000 (labor) + $8,000 (AI) = $13,000
- Client price: $40,000 (undercut 47%)
- Margin: $27,000 (68%)
- Delivery: 2 weeks

---

## Business Pillars

| Pillar | Purpose | Business Value |
|--------|---------|----------------|
| **P1: Delivery Efficiency** | Deliver projects faster with fewer hours | Lower costs, faster turnaround |
| **P2: Competitive Intelligence** | Estimate accurately, bid confidently | Win more projects |
| **P3: Quality Assurance** | Prove work meets standards, audit trails | Client acceptance, compliance |
| **P4: Autonomous Scaling** | Reduce human ratio per project | Margin expansion, scale without hiring |

## Team Structure (7 Teams)

| Pillar | Team | Agents | Purpose |
|--------|------|--------|---------|
| P1 | platform_engineering | pe_coordinator, pe_architect, pe_backenddev, pe_frontenddev, pe_devops, pe_reviewer | Delivery infrastructure and tracking |
| P2 | estimation_bidding | eb_coordinator, eb_estimator, eb_analyst, eb_reviewer | Project estimation and bid proposals |
| P3 | quality_automation | qa_coordinator, qa_engineer, qa_implementer, qa_reviewer | QA + security validation |
| P3 | decision_logging | dl_coordinator, dl_dataengineer, dl_implementer, dl_reviewer | Audit trails for compliance |
| P3 | governance | gv_coordinator, gv_policyarchitect, gv_implementer, gv_auditor, gv_reviewer | Policies and approvals |
| P4 | exception_escalation | ee_coordinator, ee_architect, ee_implementer, ee_tester | Blocker escalation workflow |
| P4 | resource_optimization | ro_coordinator, ro_analyst, ro_dataengineer, ro_implementer | Cost tracking and margins |

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

## Business Pillar Details

### P1: Delivery Efficiency

**Goal:** Deliver projects faster with fewer hours

#### P1.1: Delivery Tracking (IMMEDIATE)
Track actual hours vs planned across all phases.

**Current State:**
- Usage tracking per session/project exists
- Session duration tracked
- **Gap:** No phase-level time aggregation; no hours/story point metric

**Target State:**
- Time entry per agent session (automatic)
- Phase-level and project-level aggregation
- Hours per story point trending

**Validation:**
- [ ] Session time captured automatically
- [ ] Phase-level totals visible
- [ ] Project-level totals visible
- [ ] Trend visualization available

---

#### P1.2: Delivery Metrics Dashboard (NEAR-TERM)
Visualize hours/story point, velocity, bottlenecks.

**Target State:**
- Hours per story point metric
- Velocity trending over time
- Bottleneck detection per phase

---

### P2: Competitive Intelligence

**Goal:** Estimate accurately, bid confidently

#### P2.1: Estimation Engine (NEAR-TERM)
Generate accurate project estimates from requirements.

**Current State:**
- No estimation tooling
- Manual estimates only

**Target State:**
- Story point estimation based on requirement complexity
- Historical data lookup (similar past projects)
- Confidence intervals on estimates
- Project type templates (web, API, mobile, enterprise)

**Team:** estimation_bidding (eb_coordinator, eb_estimator, eb_analyst, eb_reviewer)

**Validation:**
- [ ] Estimates generated from requirements
- [ ] Historical comparisons available
- [ ] Confidence intervals shown
- [ ] Accuracy tracked over time

---

#### P2.2: Actual vs Estimate Tracking (NEAR-TERM)
Compare estimates to actuals, learn and improve.

**Target State:**
- Per-project estimate vs actual comparison
- Variance analysis
- Feedback loop to improve estimation model

---

#### P2.3: Bid Analyzer (DEFERRED)
Parse RFP/requirements and generate realistic quotes.

**Target State:**
- Document parser for common RFP formats
- Requirement extraction and categorization
- Quote generation with line items

---

### P3: Quality Assurance

**Goal:** Prove work meets standards, maintain audit trails

#### P3.1: Quality Gate Enforcement (IMMEDIATE)
Block delivery until quality checks pass.

**Current State:**
- Phase-gate with manual QA exists
- Stop hooks for phase validation exist
- **Gap:** No configurable quality thresholds

**Target State:**
- Configurable quality thresholds per project type
- Quality score per project
- Block handoff on quality failure

**Team:** quality_automation (qa_coordinator, qa_engineer, qa_implementer, qa_reviewer)

**Validation:**
- [ ] Quality rules evaluated on phase completion
- [ ] Quality score visible per project
- [ ] Handoff blocked on quality failure
- [ ] Security review included in workflow

---

#### P3.2: Decision Audit Trail (IMMEDIATE)
Log all technical decisions with rationale for compliance.

**Current State:**
- Session history in JSONL files
- **Gap:** No decision capture hook; no decision timeline UI

**Target State:**
- Structured decision log per project
- Rationale capture for key decisions
- Queryable decision history
- Export for public contract compliance

**Team:** decision_logging (dl_coordinator, dl_dataengineer, dl_implementer, dl_reviewer)

---

#### P3.3: Client Deliverables Packaging (NEAR-TERM)
Bundle outputs for professional client handoff.

**Target State:**
- Export templates (documentation, code, reports)
- Deliverable checklist per project type
- Version-controlled deliverable history

---

#### P3.4: Approval Workflow (NEAR-TERM)
Human sign-off on client-facing work.

**Target State:**
- Decision classification (low/medium/high risk)
- Approval workflow for client-facing outputs
- Approval history tracking

**Team:** governance (gv_coordinator, gv_policyarchitect, gv_implementer, gv_auditor, gv_reviewer)

---

### P4: Autonomous Scaling

**Goal:** Reduce human ratio per project, scale without hiring

#### P4.1: Human Ratio Tracking (IMMEDIATE)
Measure autonomy progress per project.

**Current State:**
- Usage tracking exists for tokens/cost
- **Gap:** No human vs AI hours distinction

**Target State:**
- Human hours vs AI hours tracking
- Project autonomy score
- Trend visualization over time

**Team:** resource_optimization (ro_coordinator, ro_analyst, ro_dataengineer, ro_implementer)

**Validation:**
- [ ] Human:AI ratio calculated per project
- [ ] Autonomy score visible
- [ ] Trends over time trackable

---

#### P4.2: Exception Escalation (IMMEDIATE)
Auto-escalate blockers to humans before deadlines slip.

**Current State:**
- Default policy includes escalation rules (timeout: 30m, budget exceeded, quality failed)
- **Gap:** No automatic trigger; no escalation workflow UI

**Target State:**
- Automatic trigger on timeout/budget/quality failures
- Escalation workflow with notification
- Resolution tracking

**Team:** exception_escalation (ee_coordinator, ee_architect, ee_implementer, ee_tester)

---

#### P4.3: Cost Tracking & Margin Analysis (NEAR-TERM)
Track costs and margins per project.

**Current State:**
- Token costs tracked per session
- **Gap:** No labor cost integration; no margin calculation

**Target State:**
- Human labor cost tracking
- AI cost tracking (tokens)
- Margin calculation per project
- Budget monitoring and alerts

---

## Business Pillar Dependencies

```
P1: Delivery Efficiency
    P1.1 Delivery Tracking ---+---> P1.2 Metrics Dashboard
                              |
                              +---> P2.1 Estimation Engine ---> P2.2 Actual vs Estimate
                                                            |
                                                            +---> P2.3 Bid Analyzer

P3: Quality Assurance
    P3.1 Quality Gates ---+---> P3.3 Client Deliverables
    P3.2 Decision Audit --+---> P3.4 Approval Workflow

P4: Autonomous Scaling
    P4.1 Human Ratio -----+---> P4.3 Cost Tracking
    P4.2 Exception Escalation
```

**Implementation Order:**
1. IMMEDIATE (Phase 1): P1.1, P3.1, P3.2, P4.1, P4.2
2. NEAR-TERM (Phase 2): P1.2, P2.1, P2.2, P3.3, P3.4, P4.3
3. DEFERRED (Phase 3+): P2.3

---

## Team Project Assignments

### IMMEDIATE Priority (Phase 1 - Internal Tool)

| Project | Pillar | Team | Complexity |
|---------|--------|------|------------|
| delivery-tracking | P1.1 | platform_engineering | Low |
| quality-gates | P3.1 | quality_automation | Medium |
| decision-audit | P3.2 | decision_logging | Low |
| human-ratio-tracking | P4.1 | resource_optimization | Medium |
| exception-escalation | P4.2 | exception_escalation | Medium |

### NEAR-TERM Priority (Phase 2 - Competitive Moat)

| Project | Pillar | Team | Complexity |
|---------|--------|------|------------|
| metrics-dashboard | P1.2 | platform_engineering | Medium |
| estimation-engine | P2.1 | estimation_bidding | High |
| actual-vs-estimate | P2.2 | estimation_bidding | Medium |
| client-deliverables | P3.3 | quality_automation | Medium |
| approval-workflow | P3.4 | governance | Medium |
| cost-tracking | P4.3 | resource_optimization | Medium |

### DEFERRED Priority (Phase 3+ - Track Record)

| Project | Pillar | Team | Complexity |
|---------|--------|------|------------|
| bid-analyzer | P2.3 | estimation_bidding | High |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope creep | High | High | Strict milestone boundaries |
| Estimation inaccuracy | High | Medium | Track actuals, iterate model |
| Quality escapes | Medium | High | Security in QA workflow |
| Client trust | Medium | High | Start with internal, prove results |
| AI cost increases | Medium | Medium | Track margins, adjust pricing |
