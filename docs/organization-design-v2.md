# Nolan Organization Design v2.0

## Overview

Complete organizational redesign for a large software development company (100+ employees equivalent) with full-stack web application focus.

---

## Department Structure

### 6 Departments + Default Team

| Department | Code | Teams | Focus |
|------------|------|-------|-------|
| Admin | ADM | 3 | Finance, Legal, Operations/Executive |
| HR | HR | 3 | Talent, L&D, People Ops |
| Development | DEV | 1+ | Product teams (template-based, cross-functional) |
| Infrastructure | INF | 4 | DevOps, Platform, Platform Security, IT Support |
| Business | BIZ | 4 | Sales, Marketing, Client Success, Partnerships |
| Quality Assurance | QA | 5 | Testing, Automation, AppSec, Dependencies/Bugs, Standards |
| **Default** | - | 1 | Core workflow (preserved) |

**Total: 21+ teams (expandable), ~100+ agents**

---

## Department Details

### 1. Admin Department (ADM)

**Purpose:** Financial operations, legal compliance, and executive support.

#### Teams:

##### ADM-01: Finance Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| adm_fin_coordinator | Coordinator | NOTES.md | Finance team orchestration |
| adm_fin_controller | Controller | financial-report.md | Financial reporting, budgets, forecasting |
| adm_fin_accountant | Accountant | accounting-report.md | Invoicing, AP/AR, reconciliation |
| adm_fin_analyst | Financial Analyst | cost-analysis.md | Cost analysis, profitability, usage optimization |

**Workflow:** Monthly close → Budget review → Forecasting → Reporting

##### ADM-02: Legal Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| adm_leg_coordinator | Coordinator | NOTES.md | Legal team orchestration |
| adm_leg_counsel | Legal Counsel | legal-review.md | Contract review, legal advice, risk assessment |
| adm_leg_compliance | Compliance Officer | compliance-report.md | Regulatory compliance, audit preparation |
| adm_leg_contracts | Contracts Manager | contract-status.md | Contract drafting, negotiation support |

**Workflow:** Request → Legal review → Compliance check → Approval

##### ADM-03: Operations Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| adm_ops_coordinator | Coordinator | NOTES.md | Operations team orchestration |
| adm_ops_manager | Operations Manager | operations-report.md | Vendor management, procurement, office ops |
| adm_ops_executive | Executive Assistant | executive-brief.md | C-suite support, strategy coordination |
| adm_ops_analyst | Operations Analyst | ops-analysis.md | Process optimization, efficiency metrics |

**Workflow:** Request → Analysis → Implementation → Review

---

### 2. HR Department (HR)

**Purpose:** Talent acquisition, development, and employee experience.

#### Teams:

##### HR-01: Talent Acquisition Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| hr_tal_coordinator | Coordinator | NOTES.md | Talent team orchestration |
| hr_tal_recruiter | Recruiter | recruitment-report.md | Sourcing, screening, pipeline management |
| hr_tal_interviewer | Technical Interviewer | interview-assessment.md | Technical assessments, culture fit |
| hr_tal_onboarding | Onboarding Specialist | onboarding-plan.md | New hire onboarding, documentation |

**Workflow:** Requisition → Sourcing → Screening → Interview → Offer → Onboarding

##### HR-02: Learning & Development Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| hr_ld_coordinator | Coordinator | NOTES.md | L&D team orchestration |
| hr_ld_designer | Learning Designer | training-plan.md | Training program design, content creation |
| hr_ld_trainer | Trainer | training-report.md | Training delivery, skill assessments |
| hr_ld_analyst | L&D Analyst | skill-gap-analysis.md | Skills gap analysis, career pathing |

**Workflow:** Needs analysis → Program design → Delivery → Evaluation

##### HR-03: People Operations Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| hr_pop_coordinator | Coordinator | NOTES.md | People ops team orchestration |
| hr_pop_manager | People Ops Manager | people-report.md | Policies, employee relations, culture |
| hr_pop_payroll | Payroll Specialist | payroll-report.md | Compensation, benefits, payroll processing |
| hr_pop_analyst | People Analyst | people-analytics.md | Employee metrics, engagement, retention |
| hr_pop_performance | Performance Manager | performance-review.md | Performance reviews, goal tracking |

**Workflow:** Policy → Implementation → Monitoring → Adjustment

---

### 3. Development Department (DEV)

**Purpose:** Software development through cross-functional product teams.

**Structure:** Template-based product teams. Each product gets its own cross-functional team that handles all development aspects (frontend, backend, architecture, database, etc.).

#### Teams:

##### DEV-TEMPLATE: Product Team (Template)

This template is duplicated for each product. Replace `{product}` with product name (e.g., `nolan`, `api`, `dashboard`).

| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| dev_{product}_coordinator | Coordinator | NOTES.md | Product team orchestration |
| dev_{product}_lead | Tech Lead | technical-design.md | Technical leadership, architecture decisions |
| dev_{product}_architect | Solutions Architect | architecture.md | System design, integration patterns |
| dev_{product}_frontend | Frontend Developer | frontend-progress.md | UI/UX implementation, components |
| dev_{product}_backend | Backend Developer | backend-progress.md | API, services, business logic |
| dev_{product}_database | Database Engineer | database-design.md | Schema, queries, migrations |
| dev_{product}_senior | Senior Developer | progress.md | Complex features, mentoring, code review |
| dev_{product}_developer | Developer | progress.md | Feature implementation, bug fixes |

**Workflow:**
```
Research → Architecture → Design → Implementation (parallel FE/BE) → Integration → Review
```

**Example Instantiation (Product: Nolan):**
| Agent | Role |
|-------|------|
| dev_nolan_coordinator | Coordinator |
| dev_nolan_lead | Tech Lead |
| dev_nolan_architect | Solutions Architect |
| dev_nolan_frontend | Frontend Developer |
| dev_nolan_backend | Backend Developer |
| dev_nolan_database | Database Engineer |
| dev_nolan_senior | Senior Developer |
| dev_nolan_developer | Developer |

**Notes:**
- Each product team is self-sufficient and cross-functional
- Team size can be adjusted per product (add more developers as needed)
- Coordinator manages the product backlog and sprint workflow

---

### 4. Infrastructure Department (INF)

**Purpose:** Platform engineering, DevOps, security, and IT operations.

#### Teams:

##### INF-01: DevOps Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| inf_do_coordinator | Coordinator | NOTES.md | DevOps team orchestration |
| inf_do_lead | DevOps Lead | devops-plan.md | CI/CD strategy, automation, tooling |
| inf_do_engineer | DevOps Engineer | deployment-report.md | Pipeline implementation, deployments |
| inf_do_sre | SRE Engineer | sre-report.md | Reliability, incident response, monitoring |

**Workflow:** Request → Plan → Implement → Deploy → Monitor

##### INF-02: Platform Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| inf_pl_coordinator | Coordinator | NOTES.md | Platform team orchestration |
| inf_pl_architect | Platform Architect | platform-design.md | Cloud architecture, infrastructure design |
| inf_pl_engineer | Platform Engineer | infrastructure-report.md | IaC, cloud resources, scaling |
| inf_pl_database | Database Admin | database-ops.md | Database operations, backups, performance |

**Workflow:** Design → Provision → Configure → Optimize → Maintain

##### INF-03: Platform Security Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| inf_sec_coordinator | Coordinator | NOTES.md | Platform security team orchestration |
| inf_sec_architect | Security Architect | security-design.md | Infrastructure security architecture |
| inf_sec_engineer | Security Engineer | security-report.md | Network security, access control, hardening |
| inf_sec_compliance | Security Compliance | compliance-audit.md | Security certifications, policies, audit prep |

**Workflow:** Assessment → Design → Implementation → Audit → Remediation

**Note:** Platform security handles infrastructure-level security (network, cloud, access). Application security is handled by QA department.

##### INF-04: IT Support Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| inf_it_coordinator | Coordinator | NOTES.md | IT support team orchestration |
| inf_it_manager | IT Manager | it-report.md | IT strategy, vendor management, planning |
| inf_it_specialist | IT Specialist | support-ticket.md | Helpdesk, troubleshooting, user support |
| inf_it_admin | Systems Admin | systems-report.md | System administration, access management |

**Workflow:** Ticket → Triage → Resolution → Documentation → Closure

---

### 5. Business Department (BIZ)

**Purpose:** Revenue generation, client relationships, and market presence.

#### Teams:

##### BIZ-01: Sales Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| biz_sal_coordinator | Coordinator | NOTES.md | Sales team orchestration |
| biz_sal_director | Sales Director | sales-strategy.md | Sales strategy, pipeline management, forecasting |
| biz_sal_executive | Sales Executive | deal-summary.md | Lead qualification, proposals, negotiations |
| biz_sal_engineer | Sales Engineer | technical-proposal.md | Technical pre-sales, demos, SOW |
| biz_sal_operations | Sales Operations | sales-report.md | CRM, reporting, process optimization |

**Workflow:** Lead → Qualification → Proposal → Negotiation → Close

##### BIZ-02: Marketing Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| biz_mkt_coordinator | Coordinator | NOTES.md | Marketing team orchestration |
| biz_mkt_director | Marketing Director | marketing-strategy.md | Marketing strategy, brand, campaigns |
| biz_mkt_content | Content Marketer | content-plan.md | Content creation, SEO, thought leadership |
| biz_mkt_digital | Digital Marketer | digital-report.md | Paid ads, social media, analytics |
| biz_mkt_events | Events Manager | events-plan.md | Conferences, webinars, community events |

**Workflow:** Strategy → Campaign → Execution → Analysis → Optimization

##### BIZ-03: Client Success Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| biz_cs_coordinator | Coordinator | NOTES.md | Client success team orchestration |
| biz_cs_manager | CS Manager | client-health.md | Account health, expansion, retention |
| biz_cs_specialist | CS Specialist | engagement-report.md | Onboarding, training, support |
| biz_cs_analyst | CS Analyst | cs-analytics.md | NPS, churn analysis, success metrics |

**Workflow:** Onboarding → Engagement → Review → Renewal/Expansion

##### BIZ-04: Partnerships & BD Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| biz_bd_coordinator | Coordinator | NOTES.md | BD team orchestration |
| biz_bd_director | BD Director | partnership-strategy.md | Partnership strategy, alliance management |
| biz_bd_manager | Partnership Manager | partnership-report.md | Partner relationships, co-selling |
| biz_bd_analyst | BD Analyst | market-analysis.md | Market research, competitive intelligence |

**Workflow:** Identify → Evaluate → Negotiate → Launch → Manage

---

### 6. Quality Assurance Department (QA)

**Purpose:** Comprehensive quality covering application security, testing, bugs, dependencies, and all quality aspects.

#### Teams:

##### QA-01: Testing Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| qa_tst_coordinator | Coordinator | NOTES.md | Testing team orchestration |
| qa_tst_lead | QA Lead | test-strategy.md | Test strategy, planning, resource allocation |
| qa_tst_functional | Functional Tester | functional-report.md | Functional testing, regression testing |
| qa_tst_exploratory | Exploratory Tester | exploratory-report.md | Exploratory testing, edge cases, usability |
| qa_tst_performance | Performance Tester | performance-report.md | Load testing, stress testing, benchmarks |
| qa_tst_integration | Integration Tester | integration-report.md | API testing, integration testing, E2E |

**Workflow:** Plan → Design → Execute → Report → Verify → Regression

##### QA-02: Automation Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| qa_aut_coordinator | Coordinator | NOTES.md | Automation team orchestration |
| qa_aut_architect | Automation Architect | automation-design.md | Framework design, tool selection, strategy |
| qa_aut_engineer | Automation Engineer | automation-report.md | Test automation, CI/CD integration |
| qa_aut_maintenance | Automation Maintenance | maintenance-report.md | Test maintenance, flaky test fixes |

**Workflow:** Design → Implement → Integrate → Monitor → Maintain

##### QA-03: Application Security Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| qa_sec_coordinator | Coordinator | NOTES.md | AppSec team orchestration |
| qa_sec_lead | AppSec Lead | appsec-strategy.md | Application security strategy, OWASP compliance |
| qa_sec_analyst | Security Analyst | security-findings.md | Vulnerability scanning, code analysis (SAST/DAST) |
| qa_sec_pentester | Penetration Tester | pentest-report.md | Penetration testing, security assessments |
| qa_sec_reviewer | Security Reviewer | security-review.md | Secure code review, threat modeling |

**Workflow:** Threat Model → Scan → Analyze → Report → Remediate → Verify

##### QA-04: Dependencies & Bugs Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| qa_dep_coordinator | Coordinator | NOTES.md | Dependencies team orchestration |
| qa_dep_analyst | Dependency Analyst | dependency-report.md | Dependency audits, vulnerability tracking, updates |
| qa_dep_bug_triage | Bug Triage Specialist | triage-report.md | Bug triage, prioritization, assignment |
| qa_dep_bug_analyst | Bug Analyst | bug-analysis.md | Root cause analysis, reproduction, documentation |

**Workflow:** Monitor → Triage → Analyze → Prioritize → Track → Verify

##### QA-05: Quality Standards Team
| Agent | Role | Output | Description |
|-------|------|--------|-------------|
| qa_std_coordinator | Coordinator | NOTES.md | Standards team orchestration |
| qa_std_manager | QA Manager | quality-report.md | Process governance, metrics, quality gates |
| qa_std_auditor | Quality Auditor | audit-report.md | Process audits, compliance verification |
| qa_std_analyst | Quality Analyst | quality-metrics.md | Quality metrics, defect trends, SLA tracking |
| qa_std_process | Process Engineer | process-improvement.md | Process improvement, best practices |

**Workflow:** Define → Implement → Audit → Measure → Improve

---

## Cross-Department Workflows

### Project Delivery Workflow (Full Lifecycle)

```
BIZ (Sales) → Lead qualified, SOW signed
    ↓
DEV (Architecture) → Solution design approved
    ↓
DEV (Full-Stack/Frontend/Backend) → Development sprints
    ↓
QA (Testing/Automation) → Quality gates
    ↓
INF (DevOps) → Deployment
    ↓
BIZ (Client Success) → Client handoff
    ↓
ADM (Finance) → Invoicing
```

### New Hire Workflow

```
HR (Talent) → Requisition approved, candidate selected
    ↓
ADM (Legal) → Contract prepared
    ↓
HR (People Ops) → Offer extended
    ↓
INF (IT Support) → Equipment provisioned
    ↓
HR (L&D) → Training scheduled
    ↓
DEV/BIZ/etc → Team assignment
```

### Security Incident Workflow

```
INF (Security) → Incident detected
    ↓
INF (DevOps/SRE) → Initial response
    ↓
DEV (relevant team) → Fix implemented
    ↓
QA (Testing) → Verification
    ↓
INF (Security) → Post-mortem
    ↓
ADM (Legal/Compliance) → Regulatory reporting if needed
```

---

## Role Summary

### New Roles Required

#### Admin Department (ADM)
| Role | Model | File Access |
|------|-------|-------------|
| Controller | sonnet | restricted |
| Accountant | sonnet | restricted |
| Legal Counsel | opus | restricted |
| Compliance Officer | sonnet | restricted |
| Contracts Manager | sonnet | restricted |
| Operations Manager | sonnet | restricted |
| Executive Assistant | opus | restricted |
| Operations Analyst | sonnet | restricted |

#### HR Department
| Role | Model | File Access |
|------|-------|-------------|
| Technical Interviewer | sonnet | restricted |
| Onboarding Specialist | sonnet | restricted |
| Learning Designer | sonnet | restricted |
| Trainer | sonnet | restricted |
| L&D Analyst | sonnet | restricted |
| People Ops Manager | sonnet | restricted |
| Payroll Specialist | sonnet | restricted |
| People Analyst | sonnet | restricted |
| Performance Manager | sonnet | restricted |

#### Development Department (DEV) - Product Team Template Roles
| Role | Model | File Access |
|------|-------|-------------|
| Tech Lead | opus | permissive |
| Solutions Architect | opus | permissive |
| Frontend Developer | sonnet | permissive |
| Backend Developer | sonnet | permissive |
| Database Engineer | sonnet | permissive |
| Senior Developer | sonnet | permissive |
| Developer | sonnet | permissive |

#### Infrastructure Department (INF)
| Role | Model | File Access |
|------|-------|-------------|
| DevOps Lead | opus | permissive |
| DevOps Engineer | sonnet | permissive |
| SRE Engineer | sonnet | permissive |
| Platform Architect | opus | permissive |
| Platform Engineer | sonnet | permissive |
| Database Admin | sonnet | permissive |
| Security Architect | opus | restricted |
| Security Engineer | sonnet | permissive |
| Security Compliance | sonnet | restricted |
| IT Manager | sonnet | permissive |
| IT Specialist | sonnet | permissive |
| Systems Admin | sonnet | permissive |

#### Business Department (BIZ)
| Role | Model | File Access |
|------|-------|-------------|
| Sales Director | opus | restricted |
| Sales Executive | sonnet | restricted |
| Sales Engineer | sonnet | restricted |
| Sales Operations | sonnet | restricted |
| Marketing Director | opus | restricted |
| Content Marketer | sonnet | restricted |
| Digital Marketer | sonnet | restricted |
| Events Manager | sonnet | restricted |
| CS Manager | sonnet | restricted |
| CS Specialist | sonnet | restricted |
| CS Analyst | sonnet | restricted |
| BD Director | opus | restricted |
| Partnership Manager | sonnet | restricted |
| BD Analyst | sonnet | restricted |

#### Quality Assurance Department (QA)
| Role | Model | File Access |
|------|-------|-------------|
| QA Lead | opus | restricted |
| Functional Tester | sonnet | restricted |
| Exploratory Tester | sonnet | restricted |
| Performance Tester | sonnet | restricted |
| Integration Tester | sonnet | restricted |
| Automation Architect | opus | restricted |
| Automation Engineer | sonnet | permissive |
| Automation Maintenance | sonnet | permissive |
| AppSec Lead | opus | restricted |
| Security Analyst | sonnet | restricted |
| Penetration Tester | sonnet | permissive |
| Security Reviewer | sonnet | restricted |
| Dependency Analyst | sonnet | restricted |
| Bug Triage Specialist | sonnet | restricted |
| Bug Analyst | sonnet | restricted |
| QA Manager | opus | restricted |
| Quality Auditor | sonnet | restricted |
| Quality Analyst | sonnet | restricted |
| Process Engineer | sonnet | restricted |

---

## Agent Count Summary

| Department | Teams | Agents | Notes |
|------------|-------|--------|-------|
| Admin | 3 | 12 | Finance, Legal, Operations |
| HR | 3 | 14 | Talent, L&D, People Ops |
| Development | 1+ | 8 per product | Template-based, scales with products |
| Infrastructure | 4 | 15 | DevOps, Platform, Security, IT |
| Business | 4 | 17 | Sales, Marketing, CS, BD |
| Quality Assurance | 5 | 23 | Testing, Automation, AppSec, Deps, Standards |
| Default | 1 | 6 | Core workflow |
| **Total** | **21+** | **87+** | Scales with product teams |

**Scaling Example:**
- 1 product team: 87 + 8 = 95 agents
- 3 product teams: 87 + 24 = 111 agents
- 5 product teams: 87 + 40 = 127 agents

---

## Directory Structure

```
teams/
├── default.yaml                    # Preserved (core workflow)
├── departments.yaml                # Updated department registry
│
├── adm_admin/
│   ├── finance.yaml
│   ├── legal.yaml
│   └── operations.yaml
│
├── hr_human_resources/
│   ├── talent_acquisition.yaml
│   ├── learning_development.yaml
│   └── people_operations.yaml
│
├── dev_development/
│   ├── _product_template.yaml      # Template for new products
│   └── nolan.yaml                  # Example: Nolan product team
│
├── inf_infrastructure/
│   ├── devops.yaml
│   ├── platform.yaml
│   ├── platform_security.yaml
│   └── it_support.yaml
│
├── biz_business/
│   ├── sales.yaml
│   ├── marketing.yaml
│   ├── client_success.yaml
│   └── partnerships.yaml
│
└── qa_quality/
    ├── testing.yaml
    ├── automation.yaml
    ├── application_security.yaml
    ├── dependencies_bugs.yaml
    └── standards.yaml

roles/
├── (existing core roles preserved)
│   ├── coordinator.yaml
│   ├── researcher.yaml
│   ├── planner.yaml
│   ├── implementer.yaml
│   ├── reviewer.yaml
│   └── auditor.yaml
│
└── specialized/
    ├── (existing preserved)
    └── (new roles added - see Role Summary above)
```

---

## Implementation Notes

1. **Default Team Preserved:** The core workflow (Ana, Bill, Carl, Dan, Enzo, Frank) remains unchanged for backward compatibility.

2. **Department Coordinators:** Each team has its own coordinator. Cross-department coordination handled through direct agent communication.

3. **Model Allocation:**
   - **Opus:** Leads, Directors, Architects, Coordinators (advanced reasoning)
   - **Sonnet:** Engineers, Analysts, Specialists (execution-focused)

4. **File Permissions:**
   - **Permissive:** Development, DevOps, Platform, Automation (need to write code)
   - **Restricted:** All others (primarily document production)

5. **Workflow Integration:** Teams communicate through output files and the coordinator ACK protocol established in the existing system.
