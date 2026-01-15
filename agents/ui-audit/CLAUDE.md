# ui-audit

Check UI code for accessibility issues, visual consistency, and frontend best practices.

## Environment

- `$NOLAN_DATA_ROOT` - Nolan data directory (user data, state, projects)

## Task

Audit the Nolan UI codebase for accessibility, consistency, and best practices.

## Checks to Perform

### 1. Accessibility Issues

Scan React/TSX files for common accessibility problems:
- Images without `alt` attributes: `<img` without `alt=`
- Buttons without accessible text: `<button>` with only icons
- Missing ARIA labels on interactive elements
- Click handlers on non-interactive elements (div, span with onClick)
- Missing keyboard navigation support (onClick without onKeyDown)
- Color contrast issues in hardcoded styles

### 2. Consistency Patterns

Check for inconsistent UI patterns:
- Mixed use of styling approaches (inline styles vs CSS classes vs Tailwind)
- Inconsistent spacing values (look for varied px/rem values)
- Inconsistent button styles or variants
- Different loading state implementations
- Mixed icon usage patterns

### 3. Responsive Design Issues

Look for potential responsiveness problems:
- Fixed pixel widths on containers
- Missing responsive breakpoints
- Hardcoded heights that may clip content
- Text that may overflow on small screens

### 4. Performance Patterns

Detect potential performance issues:
- Large inline SVGs that should be separate files
- Missing `key` props in lists (React warning)
- Inline function definitions in render (causes re-renders)
- Missing memoization on expensive computations

### 5. Best Practice Violations

Check for common React/frontend issues:
- Using `index` as key in dynamic lists
- Direct DOM manipulation instead of React state
- Missing error boundaries around async content
- Uncontrolled to controlled input warnings

## Output

Write findings to `$NOLAN_DATA_ROOT/.state/audits/ui-audit.json`:

```json
{
  "timestamp": "ISO8601 timestamp",
  "summary": {
    "total_issues": 0,
    "accessibility": 0,
    "consistency": 0,
    "responsive": 0,
    "performance": 0,
    "best_practices": 0
  },
  "accessibility": {
    "critical": [],
    "warnings": []
  },
  "consistency": {
    "patterns": [],
    "suggestions": []
  },
  "responsive": {
    "issues": []
  },
  "performance": {
    "issues": []
  },
  "best_practices": {
    "violations": []
  }
}
```

Each finding should include:
- `severity`: critical, warning, info
- `category`: accessibility, consistency, responsive, performance, best_practices
- `file`: path to the file
- `line`: line number if available
- `element`: the HTML/React element involved
- `issue`: description of the problem
- `suggestion`: how to fix

## Guidelines

- Accessibility issues are highest priority (affects users with disabilities)
- Consistency issues help maintain code quality
- Some checks are heuristic - mark uncertain findings as "info"
- Focus on React/TSX files in the UI directory
- If no issues found, still write an empty report with timestamp
- Create the audits directory if it doesn't exist

## Important

- This is a READ-ONLY analysis - do not modify any source files
- You can only write to the audit report file
- Focus on the UI-related code (src/components, src/pages, etc.)
