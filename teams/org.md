# Nolan Organization Structure

Reference document for organizational structure and workflows.

---

## Overview

- **Departments**: 6
- **Teams**: 23 (expandable)
- **Free Agents**: agent-ralph-ziggy, agent-ralph-nova, ...

| Department | Code | Teams | Focus |
|------------|------|-------|-------|
| Corporate | CORP | 3 | Finance, Legal, Operations/Executive |
| Human Resources | HR | 3 | Talent, L&D, People Ops |
| Development | DEV | 1+ | Product teams (template-based, cross-functional) |
| Infrastructure | INFRA | 4 | DevOps, Platform, Platform Security, IT Support |
| Business | BIZ | 4 | Sales, Marketing, Client Success, Partnerships |
| Quality Assurance | QA | 5 | Testing, Automation, AppSec, Dependencies/Bugs, Standards |

---

## Department: Corporate (CORP)

**Purpose**: Financial operations, legal compliance, and executive support.

### Finance Team

| Role | Output | Description |
|------|--------|-------------|
| Controller | financial-report.md | Financial reporting, budgets, forecasting |
| Accountant | accounting-report.md | Invoicing, AP/AR, reconciliation |
| Financial Analyst | cost-analysis.md | Cost analysis, profitability, usage optimization |

**Workflow**: Monthly close -> Budget review -> Forecasting -> Reporting

### Legal Team

| Role | Output | Description |
|------|--------|-------------|
| Legal Counsel | legal-review.md | Contract review, legal advice, risk assessment |
| Compliance Officer | compliance-report.md | Regulatory compliance, audit preparation |
| Contracts Manager | contract-status.md | Contract drafting, negotiation support |

**Workflow**: Request -> Legal review -> Compliance check -> Approval

### Operations Team

| Role | Output | Description |
|------|--------|-------------|
| Operations Manager | operations-report.md | Vendor management, procurement, office ops |
| Executive Assistant | executive-brief.md | C-suite support, strategy coordination |
| Operations Analyst | ops-analysis.md | Process optimization, efficiency metrics |

**Workflow**: Request -> Analysis -> Implementation -> Review

---

## Department: Human Resources (HR)

**Purpose**: Talent acquisition, development, and employee experience.

### Talent Acquisition Team

| Role | Output | Description |
|------|--------|-------------|
| Recruiter | recruitment-report.md | Sourcing, screening, pipeline management |
| Technical Interviewer | interview-assessment.md | Technical assessments, culture fit |
| Onboarding Specialist | onboarding-plan.md | New hire onboarding, documentation |

**Workflow**: Requisition -> Sourcing -> Screening -> Interview -> Offer -> Onboarding

### Learning & Development Team

| Role | Output | Description |
|------|--------|-------------|
| Learning Designer | training-plan.md | Training program design, content creation |
| Trainer | training-report.md | Training delivery, skill assessments |
| L&D Analyst | skill-gap-analysis.md | Skills gap analysis, career pathing |

**Workflow**: Needs analysis -> Program design -> Delivery -> Evaluation

### People Operations Team

| Role | Output | Description |
|------|--------|-------------|
| People Ops Manager | people-report.md | Policies, employee relations, culture |
| Payroll Specialist | payroll-report.md | Compensation, benefits, payroll processing |
| People Analyst | people-analytics.md | Employee metrics, engagement, retention |
| Performance Manager | performance-review.md | Performance reviews, goal tracking |

**Workflow**: Policy -> Implementation -> Monitoring -> Adjustment

---

## Department: Development (DEV)

**Purpose**: Software development through cross-functional product teams.

**Structure**: Template-based product teams. Each product gets its own cross-functional team.

### Product Team Template

Replace `{product}` with product name (e.g., `nolan`, `api`, `dashboard`).

| Role | Output | Description |
|------|--------|-------------|
| Tech Lead | technical-design.md | Technical leadership, architecture decisions |
| Solutions Architect | architecture.md | System design, integration patterns |
| Frontend Developer | frontend-progress.md | UI/UX implementation, components |
| Backend Developer | backend-progress.md | API, services, business logic |
| Database Engineer | database-design.md | Schema, queries, migrations |
| Senior Developer | progress.md | Complex features, mentoring, code review |
| Developer | progress.md | Feature implementation, bug fixes |

**Workflow**: Research -> Architecture -> Design -> Implementation (parallel FE/BE) -> Integration -> Review

**Notes**:
- Each product team is self-sufficient and cross-functional
- Team size can be adjusted per product (add more developers as needed)

---

## Department: Infrastructure (INFRA)

**Purpose**: Platform engineering, DevOps, security, and IT operations.

### DevOps Team

| Role | Output | Description |
|------|--------|-------------|
| DevOps Lead | devops-plan.md | CI/CD strategy, automation, tooling |
| DevOps Engineer | deployment-report.md | Pipeline implementation, deployments |
| SRE Engineer | sre-report.md | Reliability, incident response, monitoring |

**Workflow**: Request -> Plan -> Implement -> Deploy -> Monitor

### Platform Team

| Role | Output | Description |
|------|--------|-------------|
| Platform Architect | platform-design.md | Cloud architecture, infrastructure design |
| Platform Engineer | infrastructure-report.md | IaC, cloud resources, scaling |
| Database Admin | database-ops.md | Database operations, backups, performance |

**Workflow**: Design -> Provision -> Configure -> Optimize -> Maintain

### Platform Security Team

| Role | Output | Description |
|------|--------|-------------|
| Security Architect | security-design.md | Infrastructure security architecture |
| Security Engineer | security-report.md | Network security, access control, hardening |
| Security Compliance | compliance-audit.md | Security certifications, policies, audit prep |

**Workflow**: Assessment -> Design -> Implementation -> Audit -> Remediation

**Note**: Platform security handles infrastructure-level security (network, cloud, access). Application security is handled by QA department.

### IT Support Team

| Role | Output | Description |
|------|--------|-------------|
| IT Manager | it-report.md | IT strategy, vendor management, planning |
| IT Specialist | support-ticket.md | Helpdesk, troubleshooting, user support |
| Systems Admin | systems-report.md | System administration, access management |

**Workflow**: Ticket -> Triage -> Resolution -> Documentation -> Closure

---

## Department: Business (BIZ)

**Purpose**: Revenue generation, client relationships, and market presence.

### Sales Team

| Role | Output | Description |
|------|--------|-------------|
| Sales Director | sales-strategy.md | Sales strategy, pipeline management, forecasting |
| Sales Executive | deal-summary.md | Lead qualification, proposals, negotiations |
| Sales Engineer | technical-proposal.md | Technical pre-sales, demos, SOW |
| Sales Operations | sales-report.md | CRM, reporting, process optimization |

**Workflow**: Lead -> Qualification -> Proposal -> Negotiation -> Close

### Marketing Team

| Role | Output | Description |
|------|--------|-------------|
| Marketing Director | marketing-strategy.md | Marketing strategy, brand, campaigns |
| Content Marketer | content-plan.md | Content creation, SEO, thought leadership |
| Digital Marketer | digital-report.md | Paid ads, social media, analytics |
| Events Manager | events-plan.md | Conferences, webinars, community events |

**Workflow**: Strategy -> Campaign -> Execution -> Analysis -> Optimization

### Client Success Team

| Role | Output | Description |
|------|--------|-------------|
| CS Manager | client-health.md | Account health, expansion, retention |
| CS Specialist | engagement-report.md | Onboarding, training, support |
| CS Analyst | cs-analytics.md | NPS, churn analysis, success metrics |

**Workflow**: Onboarding -> Engagement -> Review -> Renewal/Expansion

### Partnerships & BD Team

| Role | Output | Description |
|------|--------|-------------|
| BD Director | partnership-strategy.md | Partnership strategy, alliance management |
| Partnership Manager | partnership-report.md | Partner relationships, co-selling |
| BD Analyst | market-analysis.md | Market research, competitive intelligence |

**Workflow**: Identify -> Evaluate -> Negotiate -> Launch -> Manage

---

## Department: Quality Assurance (QA)

**Purpose**: Comprehensive quality covering application security, testing, bugs, dependencies, and standards.

### Testing Team

| Role | Output | Description |
|------|--------|-------------|
| QA Lead | test-strategy.md | Test strategy, planning, resource allocation |
| Functional Tester | functional-report.md | Functional testing, regression testing |
| Exploratory Tester | exploratory-report.md | Exploratory testing, edge cases, usability |
| Performance Tester | performance-report.md | Load testing, stress testing, benchmarks |
| Integration Tester | integration-report.md | API testing, integration testing, E2E |

**Workflow**: Plan -> Design -> Execute -> Report -> Verify -> Regression

### Automation Team

| Role | Output | Description |
|------|--------|-------------|
| Automation Architect | automation-design.md | Framework design, tool selection, strategy |
| Automation Engineer | automation-report.md | Test automation, CI/CD integration |
| Automation Maintenance | maintenance-report.md | Test maintenance, flaky test fixes |

**Workflow**: Design -> Implement -> Integrate -> Monitor -> Maintain

### Application Security Team

| Role | Output | Description |
|------|--------|-------------|
| AppSec Lead | appsec-strategy.md | Application security strategy, OWASP compliance |
| Security Analyst | security-findings.md | Vulnerability scanning, code analysis (SAST/DAST) |
| Penetration Tester | pentest-report.md | Penetration testing, security assessments |
| Security Reviewer | security-review.md | Secure code review, threat modeling |

**Workflow**: Threat Model -> Scan -> Analyze -> Report -> Remediate -> Verify

### Dependencies & Bugs Team

| Role | Output | Description |
|------|--------|-------------|
| Dependency Analyst | dependency-report.md | Dependency audits, vulnerability tracking, updates |
| Bug Triage Specialist | triage-report.md | Bug triage, prioritization, assignment |
| Bug Analyst | bug-analysis.md | Root cause analysis, reproduction, documentation |

**Workflow**: Monitor -> Triage -> Analyze -> Prioritize -> Track -> Verify

### Quality Standards Team

| Role | Output | Description |
|------|--------|-------------|
| QA Manager | quality-report.md | Process governance, metrics, quality gates |
| Quality Auditor | audit-report.md | Process audits, compliance verification |
| Quality Analyst | quality-metrics.md | Quality metrics, defect trends, SLA tracking |
| Process Engineer | process-improvement.md | Process improvement, best practices |

**Workflow**: Define -> Implement -> Audit -> Measure -> Improve

---

## Cross-Department Workflows

### Project Delivery (Full Lifecycle)

```
BIZ (Sales) -> Lead qualified, SOW signed
    |
DEV (Architecture) -> Solution design approved
    |
DEV (Full-Stack/Frontend/Backend) -> Development sprints
    |
QA (Testing/Automation) -> Quality gates
    |
INFRA (DevOps) -> Deployment
    |
BIZ (Client Success) -> Client handoff
    |
CORP (Finance) -> Invoicing
```

### New Hire

```
HR (Talent) -> Requisition approved, candidate selected
    |
CORP (Legal) -> Contract prepared
    |
HR (People Ops) -> Offer extended
    |
INFRA (IT Support) -> Equipment provisioned
    |
HR (L&D) -> Training scheduled
    |
DEV/BIZ/etc -> Team assignment
```

### Security Incident

```
INFRA (Security) -> Incident detected
    |
INFRA (DevOps/SRE) -> Initial response
    |
DEV (relevant team) -> Fix implemented
    |
QA (Testing) -> Verification
    |
INFRA (Security) -> Post-mortem
    |
CORP (Legal/Compliance) -> Regulatory reporting if needed
```

---

## Role Model Allocation

| Category | Model | Examples |
|----------|-------|----------|
| Leads, Directors, Architects | opus | Tech Lead, Sales Director, Platform Architect |
| Engineers, Analysts, Specialists | sonnet | DevOps Engineer, QA Analyst, Developer |

## File Permissions

| Type | Access | Teams |
|------|--------|-------|
| Permissive | Write code/config | Development, DevOps, Platform, Automation |
| Restricted | Document production | All others |

---

## Agent Naming Convention

Format: `{dept_code}_{team_code}_{role_identifier}`

| Prefix | Department |
|--------|------------|
| corp_ | Corporate |
| hr_ | Human Resources |
| dev_ | Development |
| infra_ | Infrastructure |
| biz_ | Business |
| qa_ | Quality Assurance |

Examples:
- `corp_fin_controller` = Corporate, Finance, Controller
- `corp_leg_counsel` = Corporate, Legal, Counsel
- `dev_nolan_backend` = Development, Nolan product, Backend developer
- `infra_do_engineer` = Infrastructure, DevOps, Engineer
- `infra_pl_architect` = Infrastructure, Platform, Architect
- `qa_tst_functional` = QA, Testing, Functional tester
