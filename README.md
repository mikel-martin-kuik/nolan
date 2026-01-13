# Nolan

The natural language software development platform of the future.

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
- ollama (optional)

## Development

```bash
bash app/start.sh --dev   # Dev mode with hot reload
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

## Docker Deployment

See [DEPLOYMENT.md](app/DEPLOYMENT.md) for full Docker deployment guide.

### Environment Variables

Configure the backend via environment variables (useful for Docker):

| Variable | Default | Description |
|----------|---------|-------------|
| `NOLAN_API_HOST` | `127.0.0.1` | API bind address (use `0.0.0.0` for Docker) |
| `NOLAN_API_PORT` | `3030` | API server port |
| `NOLAN_ROOT` | `~/.nolan` | Data directory path |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `qwen2.5:1.5b` | Default Ollama model |
| `RUST_LOG` | - | Log level (`info`, `debug`, etc.) |

### docker-compose.yml Example

```yaml
services:
  backend:
    image: nolan-server:latest
    environment:
      - NOLAN_API_HOST=0.0.0.0
      - NOLAN_API_PORT=3030
      - OLLAMA_URL=http://ollama:11434
      - OLLAMA_MODEL=llama3.2:3b
    volumes:
      - nolan-data:/home/nolan/.nolan
    ports:
      - "3030:3030"

  frontend:
    image: nolan-frontend:latest
    ports:
      - "8080:80"
    depends_on:
      - backend
```

The frontend fetches runtime configuration from the backend on startup, so environment variables set on the backend container automatically propagate to the UI.

## Structure

```
nolan/
  app/.claude        (claude settings)
  app/src/           (frontend)
  app/src-tauri/     (backend)
  app/scripts/       (shell scripts)
  cronos/agents/     (cron agent definitions)
  docs/              (documentation)
```
