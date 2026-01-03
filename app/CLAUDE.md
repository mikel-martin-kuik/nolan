# Nolan Agent Team

Team of 5 agents with Scrum Master coordination. Product Owner involved only on escalation.

## Roles

| Role | Agent | Model | Output |
|------|-------|-------|--------|
| Product Owner | (Human) | - | Approvals, decisions |
| Scrum Master | Dan | sonnet | NOTES.md |
| Research | Ana | sonnet | research.md |
| Planning | Bill | sonnet | plan.md |
| QA | Enzo | sonnet | qa-review.md |
| Implementation | Carl | sonnet | progress.md |

## Workflow

All communication routes through Dan (Scrum Master):

```
Ana ──┐
Bill ─┼──→ Dan ──→ (PO only when escalation needed)
Carl ─┤
Enzo ─┘
```

### Standard Flow
```
1. Dan assigns Ana to research
2. Ana completes research.md → reports to Dan
3. Dan reviews → assigns Bill to plan
4. Bill completes plan.md → reports to Dan
5. Dan reviews → assigns Enzo to QA
6. Enzo completes qa-review.md → reports to Dan
7. Dan reviews → assigns Carl to implement (or Bill to fix if QA issues)
8. Carl completes progress.md → reports to Dan
9. Dan reviews → assigns Enzo to QA
10. Enzo completes qa-review.md → reports to Dan
11. Dan reviews → Done (or Carl to fix if QA issues)
```


## Phase Gates

1. Agent completes output file
2. Agent notifies Dan
3. Dan reviews, updates NOTES.md
4. Dan assigns next phase or escalates to PO if needed

## Escalation

Dan escalates to Product Owner when:
- Requirements unclear
- Scope changes needed
- Blockers require decisions
- Output misaligns with objectives

## Pre-Work Requirements

Before ANY agent assignment, Dan ensures:

1. **context.md** - Project objectives, scope, constraints

## Project Directory

All project files live in the projects directory:

```
DOCS_PATH=$PROJECTS_DIR/<project-name>
```

Where `$PROJECTS_DIR` is set by launch scripts to `$NOLAN_ROOT/projects`.

**CRITICAL:** NEVER create files in agent directories. ALL output goes to `$DOCS_PATH`.

## Files

| File | Location | Purpose |
|------|----------|---------|
| context.md | $DOCS_PATH | Project overview (everyone reads) |
| research.md | $DOCS_PATH[/component] | Ana's findings |
| plan.md | $DOCS_PATH[/component] | Bill's implementation plan |
| qa-review.md | $DOCS_PATH[/component] | Enzo's QA findings |
| progress.md | $DOCS_PATH[/component] | Carl's implementation status |
| NOTES.md | $DOCS_PATH | Dan's coordination hub |

## Agent Communication

Send messages to other agents:

```bash
bash -c "source \"\$NOLAN_ROOT/app/scripts/team-aliases.sh\" && <agent> '<message>'"
```

| Command | Target |
|---------|--------|
| `ana '<msg>'` | Research agent |
| `bill '<msg>'` | Planning agent |
| `carl '<msg>'` | Implementation agent |
| `dan '<msg>'` | Scrum master |
| `team '<msg>'` | All agents |

Use for: handoff notifications, status requests, coordination.

## Agent Environment
The `AGENT_NAME` environment variable is automatically set by the launch scripts (`launch-core.sh`, `spawn-agent.sh`) and Terminator layout. This variable is used by validation hooks to identify the active agent.

This is used by validation hooks to determine required output sections.
## QA Review Protocol

**When:** After each plan.md (Bill) or progress.md (Carl)

**Who:** Enzo

**Trigger:** Dan notifies Enzo when output ready

**Checklist:**
- [ ] Code executes (syntax, dependencies)
- [ ] Paths resolve ($HOME not ~, interpreters specified)
- [ ] Security (no injection, secrets, proper escaping)
- [ ] Integration with existing codebase

**Output:** `qa-review.md` in same location as reviewed file

**Gate:** Critical/High issues block handoff. Medium can proceed with tracking.

### QA Severity Levels

| Severity | Definition | Action |
|----------|------------|--------|
| Critical | Won't execute at all | Block until fixed |
| High | Security risk or major bug | Block until fixed |
| Medium | Works but has issues | Proceed, track for fix |
| Low | Style/improvement | Optional fix |
