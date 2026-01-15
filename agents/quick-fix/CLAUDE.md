# Quick Fix Agent

## Purpose

Quickly identify and fix common code issues in the Nolan project, including:
- TypeScript/JavaScript linting errors and formatting problems
- Type checking errors
- Rust code quality issues (via clippy)
- Python code issues (via ruff)
- Auto-fixable style and syntax errors

## Key Principles

1. **Minimal Changes**: Fix only what's broken, no refactoring or improvements
2. **Preserve Style**: Maintain existing code style and conventions
3. **Type Safety**: Prioritize type correctness and compiler safety
4. **Automation First**: Use auto-fix tools before manual changes
5. **No Side Effects**: Don't add features or change behavior

## Implementation Steps

### Phase 1: Project Analysis
1. Detect project types present:
   - Check `/app/package.json` for TypeScript/JavaScript frontend
   - Check `/app/src-tauri/Cargo.toml` for Rust backend
   - Check for any Python files requiring linting
2. Document findings in a status report

### Phase 2: Run Linting & Type Checking

#### For TypeScript/JavaScript Frontend (`/app/`)
```bash
# Install dependencies if needed
npm ci

# Run ESLint with auto-fix for applicable rules
npm run lint:fix

# Run TypeScript compiler for type checking
npm run build

# Report any remaining type errors
```

#### For Rust Backend (`/app/src-tauri/`)
```bash
# Check code quality
cargo clippy --all-targets --all-features

# Fix formatting
cargo fmt --all

# Report warnings and errors
```

#### For Python Scripts (`/app/scripts/`, `/scripts/`)
```bash
# Run ruff if installed, otherwise skip
ruff check . --fix || echo "ruff not available"
```

### Phase 3: Handle Auto-Fixed Issues
1. Document all auto-fixed linting and formatting issues
2. Verify auto-fixes don't break functionality
3. Commit successful auto-fixes

### Phase 4: Manual Type Error Fixes
For type errors that can't be auto-fixed:
1. Read the error message carefully
2. Make minimal targeted fixes:
   - Add missing type annotations
   - Fix incorrect type usage
   - Correct union type issues
   - Add type guards where needed
3. Avoid:
   - `any` type casting (unless justified)
   - Refactoring code beyond the specific fix
   - Adding new features
   - Changing code behavior

### Phase 5: Verification
1. Run linters again to confirm fixes
2. Build the project to verify compilation
3. Report summary of all fixes

## Output Format

Provide a comprehensive summary including:

```
## Quick Fix Summary

### TypeScript/JavaScript Frontend
- ✅ Auto-fixed issues: [count]
  - ESLint style fixes: [specific rules]
  - Formatting issues: [count]
- ⚠️ Manual fixes: [count]
  - [Specific type errors fixed]
- ❌ Remaining issues: [count]
  - [List unresolvable issues with reasons]

### Rust Backend
- ✅ Clippy warnings addressed: [count]
- ✅ Formatting applied: [yes/no]
- ❌ Remaining clippy warnings: [count]
  - [List if any]

### Python Scripts
- ✅ Issues fixed: [count]
- ❌ Remaining issues: [count]

### Build Status
- TypeScript: [PASS/FAIL with details]
- Rust: [PASS/FAIL with details]
```

## Notes

- Focus on the Nolan project at `/home/mmartin/Proyectos/nolan`
- Work directories are already set up with required tooling
- Prioritize fixes that improve type safety
- Keep changes minimal and focused
- Document all changes made for review
