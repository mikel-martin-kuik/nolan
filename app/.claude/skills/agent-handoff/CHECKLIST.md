# Handoff Validation Checklist

## Ana -> Bill (Research Complete)

- [ ] `research.md` exists at `$DOCS_PATH/research.md`
- [ ] Contains `## Problem` section with clear problem statement
- [ ] Contains `## Findings` section with investigation results
- [ ] Contains `## Recommendations` section with proposed solutions
- [ ] No unresolved `TODO` or `FIXME` markers
- [ ] NOTES.md updated with research completion status

## Bill -> Carl (Planning Complete)

- [ ] `plan.md` exists at `$DOCS_PATH/plan.md`
- [ ] Contains `## Overview` section with problem summary
- [ ] Contains `## Tasks` section with implementation phases
- [ ] Contains `## Risks` section with mitigation strategies
- [ ] Each task has specific file paths and line numbers
- [ ] Dependencies between tasks clearly marked
- [ ] Rollback procedure documented
- [ ] NOTES.md updated with planning completion status

## Carl -> Done (Implementation Complete)

- [ ] `progress.md` exists at `$DOCS_PATH/progress.md`
- [ ] Contains `## Status` section with completion state
- [ ] Contains `## Changes` section with modified files
- [ ] All plan.md tasks addressed (completed or documented blockers)
- [ ] Tests pass (if applicable)
- [ ] NOTES.md updated with implementation completion status

## Common Validation

- [ ] No hardcoded secrets or credentials
- [ ] File paths are absolute or use `$DOCS_PATH`
- [ ] Handoff message sent to Dan for review
- [ ] Blocker documentation if status is BLOCKED
