# cron-security-audit

Scan the Nolan codebase for security vulnerabilities and dangerous patterns.

## Environment

- `$NOLAN_DATA_ROOT` - Nolan data directory (user data, state, projects)

## Task

Perform a security audit of the Nolan codebase, checking for common vulnerability patterns and dependency issues.

## Checks to Perform

### 1. Dependency Vulnerabilities

Run package audits for JavaScript/TypeScript projects:
```bash
# Check for npm audit issues
npm audit --json 2>/dev/null || echo '{"vulnerabilities":{}}'

# Check for cargo audit issues (if cargo-audit installed)
cargo audit --json 2>/dev/null || echo '{"vulnerabilities":[]}'
```

### 2. Hardcoded Secrets Pattern Scan

Search for patterns that might indicate hardcoded secrets:
- API keys: `['"](sk-|pk-|api[_-]?key|apikey)[a-zA-Z0-9]{20,}['"]`
- Tokens: `['"](token|bearer|auth)['"]\s*[=:]\s*['"][^'"]{20,}['"]`
- Passwords: `password\s*[=:]\s*['"][^'"]+['"]` (excluding empty or placeholder values)

### 3. Dangerous Code Patterns

Scan for potentially unsafe patterns:
- `eval(` - Dynamic code execution
- `Function(` - Dynamic function creation
- `dangerouslySetInnerHTML` - React XSS risk
- `innerHTML\s*=` - DOM XSS risk
- `document.write` - DOM manipulation risk
- `new Function` - Dynamic code execution
- Unsafe regex patterns (ReDoS risk)

### 4. SQL Injection Patterns

Look for string concatenation in SQL-like contexts:
- Template literals in query strings without parameterization
- String concatenation with `+` in SQL contexts

## Output

Write findings to `$NOLAN_DATA_ROOT/.state/audits/security-audit.json`:

```json
{
  "timestamp": "ISO8601 timestamp",
  "summary": {
    "total_issues": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "dependency_audit": {
    "npm": { "vulnerabilities": [] },
    "cargo": { "vulnerabilities": [] }
  },
  "code_patterns": {
    "hardcoded_secrets": [],
    "dangerous_patterns": [],
    "sql_injection_risks": []
  }
}
```

Each finding should include:
- `severity`: critical, high, medium, low
- `file`: path to the file
- `line`: line number if available
- `pattern`: what was matched
- `recommendation`: how to fix

## Guidelines

- Only report actual issues, not false positives
- Do not access or read actual secret values
- Focus on patterns, not content
- If no issues found, still write an empty report with timestamp
- Create the audits directory if it doesn't exist

## Important

- This is a READ-ONLY audit - do not modify any source files
- You can only write to the audit report file
- False positives are acceptable; better to over-report than miss real issues
