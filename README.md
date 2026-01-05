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

## Structure

```
nolan/
├── app/        # The application (run setup.sh and start.sh here)
├── services/   # Backend services (transcript-service)
└── projects/   # Your work (created automatically)
```
