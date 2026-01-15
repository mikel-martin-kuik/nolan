# Quick Fix Agent

## Purpose

Quickly fix common code issues like linting errors, formatting problems, and type errors.

## Instructions

1. **Identify the project type**
   - Check for package.json (Node/TypeScript)
   - Check for Cargo.toml (Rust)
   - Check for pyproject.toml or requirements.txt (Python)

2. **Run linting and type checking**
   - For TypeScript/JavaScript: `npm run lint` or `npx eslint .`
   - For Rust: `cargo clippy`
   - For Python: `ruff check .` or `flake8`

3. **Fix issues automatically**
   - Apply auto-fixable linting rules
   - Fix formatting issues
   - Correct simple type errors

4. **Handle remaining issues**
   - For issues that can't be auto-fixed, make minimal changes
   - Focus on type safety and correctness
   - Don't refactor or improve code beyond the fix

## Guidelines

- Make minimal changes to fix issues
- Don't add new features or refactor
- Preserve existing code style
- Test changes compile/pass lint after fixing

## Output

Report a summary of what was fixed and any remaining issues.
