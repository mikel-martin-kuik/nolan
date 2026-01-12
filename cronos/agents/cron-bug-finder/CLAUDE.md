# cron-bug-finder

Detect potential bugs through static analysis: type errors, null checks, unused variables, and code quality issues.

## Environment

- `$NOLAN_DATA_ROOT` - Nolan data directory (user data, state, projects)

## Task

Run static analysis on the Nolan codebase to detect potential bugs and code quality issues.

## Checks to Perform

### 1. TypeScript/JavaScript Type Errors

Run TypeScript compiler in check mode:
```bash
# Check for TypeScript errors (if tsconfig exists)
npx tsc --noEmit 2>&1 || true
```

### 2. ESLint Issues

Run ESLint for JavaScript/TypeScript code quality:
```bash
# Run eslint if available
npx eslint . --format json 2>/dev/null || echo '[]'
```

### 3. Rust Compiler Checks

Run Cargo check for Rust projects:
```bash
# Check Rust code
cargo check --message-format=json 2>&1 || true
```

### 4. Dead Code Detection

Search for patterns indicating unused code:
- Unused imports (look for imports not referenced elsewhere in file)
- Functions/variables prefixed with `_` (intentionally unused)
- Exported functions never imported elsewhere

### 5. Null/Undefined Risk Patterns

Scan for risky null/undefined patterns:
- `!.` - Non-null assertions (potential runtime errors)
- `as any` - Type assertions that bypass type checking
- Optional chaining on non-optional values
- Missing null checks before property access

### 6. Potential Race Conditions

Look for patterns that might indicate race conditions:
- Async operations without proper await
- State updates after unmount (React useEffect without cleanup)
- Concurrent modifications to shared state

## Output

Write findings to `$NOLAN_DATA_ROOT/.state/audits/bug-audit.json`:

```json
{
  "timestamp": "ISO8601 timestamp",
  "summary": {
    "total_issues": 0,
    "type_errors": 0,
    "lint_issues": 0,
    "null_risks": 0,
    "dead_code": 0,
    "race_conditions": 0
  },
  "typescript": {
    "errors": [],
    "warnings": []
  },
  "rust": {
    "errors": [],
    "warnings": []
  },
  "lint": {
    "errors": [],
    "warnings": []
  },
  "patterns": {
    "null_risks": [],
    "dead_code": [],
    "race_conditions": []
  }
}
```

Each finding should include:
- `severity`: error, warning, info
- `file`: path to the file
- `line`: line number if available
- `message`: description of the issue
- `code`: error/warning code if available
- `suggestion`: how to fix (if known)

## Guidelines

- Focus on actionable issues that indicate real bugs
- Prioritize type errors and lint errors over style issues
- Dead code detection may have false positives - mark as "info" severity
- Race condition patterns are heuristic - mark as "warning"
- If no issues found, still write an empty report with timestamp
- Create the audits directory if it doesn't exist

## Important

- This is a READ-ONLY analysis - do not modify any source files
- You can only write to the audit report file
- Run all checks even if some fail (different projects may have different tooling)
