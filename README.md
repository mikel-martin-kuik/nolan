# Nolan

AI agent team coordination system with 5 specialized Claude agents.

## Quick Start

```bash
cd app
./setup.sh   # First time only
./start.sh   # Launch Nolan
```

That's it. The app auto-builds on first run.

## Requirements

- Node.js 18+
- Rust ([rustup.rs](https://rustup.rs))
- tmux

## The Team

| Agent | Role |
|-------|------|
| Dan | Scrum Master - coordinates team |
| Ana | Research - gathers requirements |
| Bill | Planning - designs solutions |
| Carl | Implementation - writes code |
| Enzo | QA - validates quality |

## Development

```bash
cd app
./scripts/start-gui.sh --dev   # Dev mode with hot reload
```

## Terminal Access

Nolan provides multiple ways to interact with agent terminals:

### Embedded Terminal (New)
- Click the terminal button on any active agent card in the Live tab
- Terminal opens within Nolan UI with per-agent color themes
- Full keyboard support (arrows, tab, Ctrl+C, etc.)
- Real-time output streaming

### External Terminal
- Click "Open External" to launch in native terminal window
- Automatically detects platform (gnome-terminal, Terminal.app, iTerm2)
- Useful for full-screen work or when running intensive commands

### Features
- **Session persistence**: Powered by tmux - agents survive app restarts
- **Bidirectional communication**: Type commands, interact with prompts
- **ANSI color support**: Terminal colors preserved
- **Clickable URLs**: Open links directly from terminal output

## Structure

```
nolan/
├── app/        # The application (run setup.sh and start.sh here)
├── services/   # Backend services (transcript-service)
└── projects/   # Your work (created automatically)
```
