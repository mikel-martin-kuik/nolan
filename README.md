# Nolan - AI Agent Team Coordination System

Nolan is a production-ready AI agent coordination system featuring a team of specialized Claude agents working together through a Scrum-inspired workflow.

## Quick Start

**IMPORTANT:** You must run `setup.sh` before first use.

```bash
# 1. Clone the repository
git clone https://github.com/mikel-martin-kuik/nolan.git
cd nolan/app

# 2. Run setup (REQUIRED - generates configuration)
./setup.sh

# 3. Launch Nolan
./start.sh
```

## What is Nolan?

Nolan coordinates a team of 5 specialized AI agents:

- **Ana** (Research Agent) - Gathers information and analyzes requirements
- **Bill** (Planning Agent) - Designs implementation plans and architectures
- **Carl** (Implementation Agent) - Writes code and implements features
- **Enzo** (QA Agent) - Reviews code quality and validates implementations
- **Dan** (Scrum Master) - Coordinates the team and manages workflow

All communication flows through Dan, who assigns work and ensures quality gates are met.

## System Requirements

### Required

- **Git** - Version control
- **tmux** - Terminal multiplexer for agent sessions
- **Node.js** v18+ - Frontend runtime
- **Rust** - Tauri backend (install from [rustup.rs](https://rustup.rs))

### Optional

- **Terminator** - Terminal emulator with grid layout (enhances agent view)

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/mikel-martin-kuik/nolan.git
cd nolan
```

### 2. Run Setup Script

**This step is REQUIRED.** The setup script generates portable configuration files:

```bash
cd app
./setup.sh
```

**What setup.sh does:**
- Detects your Nolan installation path automatically
- Generates `terminator_config` with absolute paths for your system
- Verifies directory structure
- Checks runtime dependencies
- Creates projects directory if missing

### 3. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Rust dependencies are handled by Cargo automatically
```

### 4. Build (Optional)

To build the production version:

```bash
# Build frontend
npm run build

# Build Rust/Tauri backend
cd src-tauri
cargo build --release
```

## Usage

### Launching Nolan

```bash
cd app
./start.sh
```

This launches the Nolan GUI and supporting services.

### Project Structure

```
nolan/
├── app/                    # Complete Nolan application (SHIP THIS)
│   ├── agents/             # Agent configurations
│   ├── .claude/            # Skills, commands, hooks
│   ├── scripts/            # Shell scripts
│   ├── src/                # Tauri frontend (TypeScript/React)
│   ├── src-tauri/          # Tauri backend (Rust)
│   ├── setup.sh            # Setup script (RUN FIRST!)
│   ├── start.sh            # Launch script
│   └── terminator_config.template  # Config template
└── projects/               # User workspace (NOT shipped)
    └── your-projects/      # Your work goes here
```

**Important:**
- `app/` contains the complete Nolan system
- `projects/` is your workspace (separate from app, not in git)
- Agent team works on projects in the `projects/` directory

## Configuration

### First-Time Setup

After cloning, you **must** run `setup.sh`:

```bash
cd app
./setup.sh
```

Never commit `app/terminator_config` - it's generated per-machine.

### Environment Variables

Nolan respects these optional environment variables:

- `NOLAN_APP_ROOT` - Override app root detection
- `HOME` - Used for user home directory (required)

## Troubleshooting

### Permission Denied

```bash
chmod +x setup.sh
./setup.sh
```

### Config Not Generated

Make sure you ran `setup.sh` first:

```bash
cd app
./setup.sh
```

### Agents Can't Find Projects

Verify projects directory exists at repository root:

```bash
# From repository root
ls -la projects/
```

### Terminator Not Found

Terminator is optional. The system works without it. Install if desired:

```bash
# Ubuntu/Debian
sudo apt install terminator

# Fedora
sudo dnf install terminator
```

### Build Failures

Ensure all dependencies are installed:

```bash
# Check Node.js
node --version  # Should be v18+

# Check Rust
cargo --version

# Check tmux
tmux -V

# Reinstall Node modules if needed
rm -rf node_modules package-lock.json
npm install
```

## Development

### Project Workflow

1. Dan (Scrum Master) assigns work to agents
2. Ana researches requirements → `research.md`
3. Bill creates implementation plan → `plan.md`
4. Enzo reviews plan → `qa-review.md`
5. Carl implements → `progress.md`
6. Enzo validates → `qa-review.md`
7. Dan marks complete → `NOTES.md`

All output goes to `projects/<project-name>/` directory.

### Running in Development Mode

```bash
# Frontend development server
npm run dev

# Tauri development mode
npm run tauri dev
```

### Testing Portability

Validate the repository works anywhere:

```bash
# From repository root
./test-fresh-clone.sh
```

This clones to `/tmp`, runs setup, and validates everything works.

## Architecture

### Technology Stack

- **Frontend**: TypeScript, React, Vite, Tailwind CSS
- **Backend**: Rust, Tauri
- **Agents**: Claude API (Anthropic)
- **Terminal**: tmux sessions for each agent

### Key Design Principles

1. **Portable** - Zero hardcoded paths, works anywhere
2. **Self-contained** - App directory contains everything needed
3. **Separation** - app/ (product) separate from projects/ (user data)
4. **Generated configs** - Machine-specific configs created by setup.sh

## Contributing

Issues and pull requests welcome at [github.com/mikel-martin-kuik/nolan](https://github.com/mikel-martin-kuik/nolan).

## License

[Add your license here]

## Credits

Built with Claude Code and the Claude Agent SDK.
