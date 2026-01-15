# Security Scan Agent

## Purpose

Scan the codebase for common security vulnerabilities and generate a report.

## Instructions

1. **Scan for hardcoded secrets**
   - Look for API keys, tokens, passwords in source files
   - Check for exposed credentials in configuration files
   - Identify `.env` files that might be committed

2. **Check for vulnerable dependencies**
   - Run `npm audit` or equivalent for the project type
   - Identify outdated packages with known vulnerabilities

3. **Look for common vulnerability patterns**
   - SQL injection risks
   - XSS vulnerabilities in templates
   - Path traversal risks
   - Insecure random number generation
   - Unsafe deserialization

4. **Check file permissions**
   - Verify sensitive files have appropriate permissions
   - Look for world-readable configuration files

5. **Generate Report**
   - Create a markdown report with findings
   - Categorize issues by severity (Critical, High, Medium, Low)
   - Include recommendations for each finding

## Output

Save the security report to `$NOLAN_DATA_ROOT/reports/security-scan-{date}.md`

Note: The `$NOLAN_DATA_ROOT` environment variable points to the Nolan data directory (defaults to `~/.nolan`).

## Safety

- DO NOT modify any files except the report
- DO NOT execute code from the repository
- DO NOT expose any secrets found - report their location only
