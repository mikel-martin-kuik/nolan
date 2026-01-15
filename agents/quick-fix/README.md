# Quick Fix Agent

## Overview

The Quick Fix Agent is an autonomous agent designed to identify and automatically fix common code issues in the Nolan project. It handles:

- **TypeScript/JavaScript**: ESLint rules, formatting, and type checking errors
- **Rust**: Code quality warnings via Clippy and formatting via rustfmt
- **Python**: Code style and quality issues via ruff
- **Cross-project**: Comprehensive analysis and reporting

## Features

✅ **Automatic Detection**: Identifies project types and available tools
✅ **Auto-Fix First**: Applies automatic fixes for supported issues
✅ **Type Safety**: Focuses on type correctness and compiler errors
✅ **Minimal Changes**: Only fixes what's needed, preserves existing code style
✅ **Comprehensive Reports**: Detailed markdown reports of all fixes
✅ **Build Verification**: Confirms all fixes compile successfully

## Usage

### Run Quick Fix Agent

```bash
# Basic usage (uses default project root)
./scheduler/agents/quick-fix/main.sh

# Specify custom project root
./scheduler/agents/quick-fix/main.sh /path/to/project
```

### What Gets Fixed

#### TypeScript/JavaScript Frontend

The agent runs ESLint with the following fixes:

- Import/export issues
- Unused variables and imports
- Formatting problems
- JSX syntax issues
- Style rule violations

Type errors that can't be auto-fixed are identified in the report for manual review.

#### Rust Backend

The agent applies:

- **cargo fmt**: Automatic code formatting
- **cargo clippy**: Code quality analysis with warnings

Common clippy issues fixed include:

- Unused code
- Inefficient patterns
- Simplified expressions
- Better practice recommendations

#### Python Scripts

The agent runs ruff to fix:

- Import organization
- Unused imports
- Code style issues
- Naming conventions

## Output

The agent generates a comprehensive markdown report saved to:

```
.quick-fix-report-YYYYMMDD_HHMMSS.md
```

### Report Sections

1. **Detected Project Types**: Shows which components were analyzed
2. **TypeScript/JavaScript**: Auto-fixes, manual fixes, and remaining issues
3. **Rust Backend**: Formatting and clippy results
4. **Python Scripts**: Issues fixed and remaining problems
5. **Verification Results**: Build status after fixes
6. **Statistics**: Summary of all changes

Example report format:

```markdown
# Quick Fix Agent Report

## Summary

### Detected Project Types
- TypeScript/JavaScript Frontend: ✅ Yes
- Rust Backend: ✅ Yes
- Python Scripts: ✅ Yes

### TypeScript/JavaScript
- ✅ ESLint auto-fix: Completed
- ✅ TypeScript Build: PASS

### Rust Backend
- ✅ cargo fmt: Formatting applied
- ✅ cargo clippy: No warnings

### Python Scripts
- ✅ ruff: No issues found

## Verification Results
- ✅ TypeScript: Build successful
- ✅ Rust: Build successful

## Statistics
- Total fixes applied: 8
- Remaining issues: 0

✅ **Status: All issues fixed!**
```

## Integration with Scheduler

The Quick Fix Agent is designed to be used within the Scheduler agent orchestration system:

### Configuration Files

- **CLAUDE.md**: Detailed implementation instructions for Claude-based agents
- **agent.yaml**: Agent metadata, phases, and configuration
- **main.sh**: Executable implementation

### Agent Metadata (agent.yaml)

```yaml
agent:
  id: "quick-fix"
  name: "Quick Fix Agent"
  type: "autonomous"
  schedule: "manual"  # Triggered on-demand
  capabilities:
    - "lint"
    - "type-checking"
    - "code-formatting"
    - "error-fixing"
```

## Phases

The agent executes in 6 phases:

1. **Analyze**: Detect project types and required tools
2. **Lint TypeScript**: Run ESLint with auto-fix
3. **Lint Rust**: Run cargo clippy and cargo fmt
4. **Lint Python**: Run ruff checks and fixes
5. **Verify**: Build projects to confirm fixes work
6. **Report**: Generate comprehensive summary

## Requirements

### Tools Required

- **Node.js** >= 18 (for npm/ESLint)
- **Rust** toolchain (for cargo/clippy/rustfmt)
- **Python 3.8+** (for ruff, optional)

### Project Structure

The agent expects this directory structure:

```
/home/mmartin/Proyectos/nolan/
├── app/
│   ├── package.json          # Frontend dependencies
│   ├── src/                  # TypeScript source
│   └── src-tauri/
│       ├── Cargo.toml        # Rust dependencies
│       └── src/              # Rust source
├── app/scripts/              # Python/Bash scripts
└── scripts/                  # Root-level scripts
```

## How It Works

### Phase 1: Project Analysis

```bash
# Checks for presence of:
- /app/package.json (TypeScript/JavaScript)
- /app/src-tauri/Cargo.toml (Rust)
- /app/scripts/*.py (Python)
- /scripts/*.py (Python)
```

### Phase 2: TypeScript Linting

```bash
cd app/
npm ci                          # Install dependencies
npx eslint src/ --fix          # Auto-fix linting issues
npm run build                  # Type checking via tsc
```

### Phase 3: Rust Code Quality

```bash
cd app/src-tauri/
cargo fmt --all                # Format code
cargo clippy --all-targets     # Check for warnings
```

### Phase 4: Python Linting

```bash
ruff check /path/to/scripts --fix  # Fix Python issues
```

### Phase 5: Verification

```bash
# Rebuild projects to confirm all fixes work
npm run build          # TypeScript
cargo build            # Rust
```

## Examples

### Running the Agent

```bash
cd /home/mmartin/Proyectos/nolan
./scheduler/agents/quick-fix/main.sh

# Output:
# [INFO] Starting Quick Fix Agent
# [INFO] Project root: /home/mmartin/Proyectos/nolan
# ...
# [✓] ESLint auto-fix completed
# [✓] TypeScript compilation successful
# [✓] Cargo fmt applied formatting
# [✓] Quick Fix Agent completed successfully
#
# Report: .quick-fix-report-20250115_143022.md
```

### Checking the Report

```bash
# View the generated report
cat .quick-fix-report-20250115_143022.md

# Example output:
# # Quick Fix Agent Report
#
# ### TypeScript/JavaScript
# - ✅ ESLint auto-fix: Completed
# - ✅ TypeScript Build: PASS
#
# ### Rust Backend
# - ✅ cargo fmt: Formatting applied
# - ✅ cargo clippy: No warnings
#
# ## Statistics
# - Total fixes applied: 8
# - Remaining issues: 0
```

## Design Principles

### 1. Minimal Changes
- Only fixes what's broken
- Doesn't refactor or improve code beyond the fix
- Preserves existing code style

### 2. Automation First
- Uses built-in auto-fix tools before manual changes
- Focuses on high-confidence changes
- Documents uncertain changes for review

### 3. Type Safety
- Prioritizes type correctness
- Highlights remaining type errors
- Avoids `any` type unless justified

### 4. No Side Effects
- Doesn't add features or change behavior
- Doesn't modify configuration files
- Doesn't update dependencies

### 5. Comprehensive Reporting
- Clear summary of all changes
- Statistics on issues fixed
- Guidance for remaining manual work

## Limitations

### What It Can't Fix

- Complex architectural changes
- Runtime behavior bugs
- Logic errors requiring context
- Design pattern violations
- Test failures (not a primary purpose)

### Manual Review Required

- Issues marked with ⚠️ in the report
- Complex type errors
- Interdependent fixes
- Changes that need business logic review

## Troubleshooting

### NPM Installation Issues

If `npm ci` fails:
```bash
cd app/
npm install --legacy-peer-deps
```

### Cargo Build Slow

First build can take several minutes:
```bash
# This is normal for Rust first builds
# Subsequent builds are faster
```

### Ruff Not Available

If ruff isn't installed, Python linting is skipped:
```bash
pip install ruff
# Then run the agent again
```

## Contributing

To extend the Quick Fix Agent:

1. Add new linting phase to `main.sh`
2. Update `agent.yaml` with new capabilities
3. Document fixes in the report generation section
4. Test with the Nolan project

## See Also

- [CLAUDE.md](./CLAUDE.md) - Implementation instructions
- [agent.yaml](./agent.yaml) - Agent configuration
- [main.sh](./main.sh) - Agent implementation

## License

Part of the Nolan project.
