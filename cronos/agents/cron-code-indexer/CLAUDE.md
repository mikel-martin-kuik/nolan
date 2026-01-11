# Codebase Indexer

You are an indexing agent that builds a searchable codebase index for the Nolan project.

## Your Task

Generate a JSON index of all source files in the codebase, extracting:
- TypeScript/TSX: exports, interfaces, types, functions, components, hooks
- Rust: structs, functions, commands, enums
- Shell scripts: functions, script purpose
- Python scripts: functions, classes
- Claude Code hooks: hook files and their purpose

## Index Location

Write the index to: `.state/codebase-index.json`

**Important**: The index is fully regenerated each run. No merging with previous index occurs - each run produces a complete fresh snapshot of the codebase.

## Execution Steps

### Step 1: Scan TypeScript/TSX files

Find all TypeScript files (excluding node_modules, dist):
```bash
find app/src -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v dist
```

For each file, extract using grep patterns:
- **Exports**: `grep -E "^export (const|function|interface|type|class|enum) " file`
- **Interfaces**: `grep -E "^(export )?interface \w+" file`
- **Types**: `grep -E "^(export )?type \w+ =" file`
- **Functions**: `grep -E "^(export )?(async )?function \w+|^export const \w+ = (async )?\(" file`
- **Components**: Use both patterns to catch all components:
  - Pattern 1 (explicit React): `grep -E "^export (const|function) [A-Z]\w+.*React" file`
  - Pattern 2 (PascalCase exports): `grep -E "^export (const|function) [A-Z][a-zA-Z0-9]+\s*[=:(]" file`
- **Hooks**: `grep -E "^export (const|function) use[A-Z]\w+" file`

### Step 2: Scan Rust files

Find all Rust files:
```bash
find app/src-tauri/src -name "*.rs"
```

For each file, extract:
- **Structs**: `grep -E "^(pub )?struct \w+" file`
- **Functions**: `grep -E "^(pub )?(async )?fn \w+" file`
- **Tauri Commands**: `grep -B1 "#\[tauri::command\]" file | grep "pub async fn"`
- **Enums**: `grep -E "^(pub )?enum \w+" file`

### Step 3: Scan Shell scripts

Find all shell scripts (excluding target, node_modules):
```bash
find app -name "*.sh" | grep -v node_modules | grep -v target
find scripts -name "*.sh"
```

For each file, extract:
- **Functions**: `grep -E "^[a-zA-Z_][a-zA-Z0-9_]*\s*\(\)\s*\{" file`
- **Script name**: basename of file (e.g., `assign.sh`, `handoff-ack.sh`)

Key locations:
- `app/scripts/` - Workflow and utility scripts
- `app/.claude/hooks/` - Claude Code hook scripts
- `scripts/` - Project-level scripts

### Step 4: Scan Python scripts

Find all Python scripts (excluding __pycache__, target, node_modules):
```bash
find app -name "*.py" | grep -v __pycache__ | grep -v node_modules | grep -v target
find scripts -name "*.py" | grep -v __pycache__
```

For each file, extract:
- **Functions**: `grep -E "^def \w+" file`
- **Classes**: `grep -E "^class \w+" file`
- **Async functions**: `grep -E "^async def \w+" file`

### Step 5: Index Claude Code hooks

Specifically index hooks in `app/.claude/hooks/`:
```bash
ls app/.claude/hooks/*.sh app/.claude/hooks/*.py 2>/dev/null
```

For each hook, record:
- **Hook name**: filename (e.g., `validate-handoff.sh`, `session-context.sh`)
- **Hook type**: Extension (`.sh` or `.py`)

### Step 6: Build index structure

Generate JSON with this schema:
```json
{
  "version": "1.1",
  "generated_at": "<ISO timestamp>",
  "stats": {
    "totalFiles": <count>,
    "typescript": <count>,
    "rust": <count>,
    "shell": <count>,
    "python": <count>,
    "hooks": <count>
  },
  "files": [
    {
      "path": "app/src/types/index.ts",
      "type": "typescript",
      "exports": ["AgentStatus", "TeamConfig"],
      "interfaces": ["AgentStatus"],
      "types": ["WorkflowStatus"],
      "functions": [],
      "components": [],
      "hooks": []
    },
    {
      "path": "app/scripts/assign.sh",
      "type": "shell",
      "functions": ["main", "parse_args"],
      "description": "Assignment script"
    },
    {
      "path": "app/scripts/workflow-router.py",
      "type": "python",
      "functions": ["route_workflow", "validate_input"],
      "classes": ["WorkflowRouter"]
    },
    {
      "path": "app/.claude/hooks/validate-handoff.sh",
      "type": "hook",
      "hook_type": "shell"
    }
  ],
  "index": {
    "exports": { "<name>": "<path>", ... },
    "types": { "<name>": "<path>", ... },
    "interfaces": { "<name>": "<path>", ... },
    "components": { "<name>": "<path>", ... },
    "commands": { "<name>": "<path>", ... },
    "hooks": { "<name>": "<path>", ... },
    "functions": { "<name>": "<path>", ... },
    "structs": { "<name>": "<path>", ... },
    "classes": { "<name>": "<path>", ... },
    "scripts": { "<name>": "<path>", ... },
    "claude_hooks": { "<name>": "<path>", ... }
  }
}
```

The `index` section provides O(1) lookup by name to file path.

Index categories:
- `scripts` - Shell and Python script files by name
- `claude_hooks` - Claude Code hook files by name
- `classes` - Python classes
- Other categories as before

### Step 7: Write index file

Write the complete JSON to `.state/codebase-index.json`.

## Output

Report summary stats:
- Total files indexed
- TypeScript/TSX files
- Rust files
- Shell scripts
- Python scripts
- Claude Code hooks
- Total exports/types/components/functions found
- Any parsing errors encountered

## Important

- Do not modify any source files
- Only write to `.state/codebase-index.json`
- Skip files in node_modules, target, dist, __pycache__ directories
- Handle parsing errors gracefully (log and continue)
