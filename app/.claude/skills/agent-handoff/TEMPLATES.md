# Handoff Message Templates

## Research Complete (Ana -> Bill)

```
HANDOFF: Ana -> Bill
Project: [project-name]
Phase: Research complete
Status: COMPLETE
Output: $HOME/nolan/app/projects/[project-name]/research.md
Summary: [Problem investigated]. [Key findings]. [Recommended approach].
Blockers: None
```

## Planning Complete (Bill -> Carl)

```
HANDOFF: Bill -> Carl
Project: [project-name]
Phase: Planning complete
Status: COMPLETE
Output: $HOME/nolan/app/projects/[project-name]/plan.md
Summary: [N] tasks defined in [N] phases. [Key implementation approach]. [Notable risks/dependencies].
Blockers: None
```

## Implementation Complete (Carl -> Done)

```
HANDOFF: Carl -> Done
Project: [project-name]
Phase: Implementation complete
Status: COMPLETE
Output: $HOME/nolan/app/projects/[project-name]/progress.md
Summary: [N] tasks completed. [Key changes made]. [Test results].
Blockers: None
```

## Blocked Status

```
HANDOFF: [Agent] -> Dan
Project: [project-name]
Phase: [current phase]
Status: BLOCKED
Output: [partial output path]
Summary: [Work completed so far]. [What is blocking].
Blockers:
- [Blocker 1]: [description and what's needed to resolve]
- [Blocker 2]: [description and what's needed to resolve]
```

## NOTES.md Update Template

```markdown
## Log Entry
- [YYYY-MM-DD HH:MM]: [Agent] completed [phase]
- Output: [file path]
- Status: COMPLETE|BLOCKED
- Next: [Dan review | PO approval | Next agent starts]
```
