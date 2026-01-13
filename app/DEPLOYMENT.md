# Nolan Headless Server Deployment

Guide for deploying Nolan backend to headless servers (e.g., Raspberry Pi 5).

## Architecture

The Nolan backend runs as a headless HTTP API server (Axum on port 3030) without the Tauri GUI. It provides:
- REST API for all operations
- WebSocket support for real-time streaming
- Cronos scheduler for automated agents
- Tmux session management for agent execution

## Build Times

| Platform | Stage | Duration | Notes |
|----------|-------|----------|-------|
| x86_64 (i7-12700) | Dependencies | ~2 min | Cached in Docker layer |
| x86_64 (i7-12700) | nolan crate | ~1 min | Final compilation |
| x86_64 (i7-12700) | **Total** | **~5 min** | With cached base image |
| ARM64 (Pi5) | Dependencies | ~19 min | First build, no cache |
| ARM64 (Pi5) | nolan crate | ~8 min | Final compilation |
| ARM64 (Pi5) | **Total** | **~30 min** | Full build from scratch |

## Image Sizes

| Platform | Size | Notes |
|----------|------|-------|
| x86_64 | 1.38 GB | Includes GTK runtime libs |
| ARM64 | 1.32 GB | Includes GTK runtime libs |

## Lessons Learned

### 1. Rust Version Requirements
- **Issue**: `tokio-cron-scheduler v0.15.1` requires Rust edition 2024
- **Solution**: Use `rust:1.85-bookworm` or newer (edition 2024 stabilized in Rust 1.85)
- **Impact**: ~5 min wasted on failed build with Rust 1.83

### 2. Claude CLI Installer Requires Bash
- **Issue**: Debian slim uses `dash` as `/bin/sh`, Claude installer uses bash syntax
- **Solution**: Use `curl ... | bash` instead of `curl ... | sh`
- **Impact**: Build failure, ~3 min wasted

### 3. Tauri Links Against GTK at Runtime
- **Issue**: Even headless binary requires GTK shared libraries
- **Solution**: Include `libgtk-3-0`, `libwebkit2gtk-4.1-0`, `libayatana-appindicator3-1` in runtime image
- **Impact**: Adds ~800MB to image size, but necessary for Tauri-linked binary
- **Future Optimization**: Consider refactoring to fully separate headless crate without Tauri dependency

### 4. Tauri Build Dependencies
- **Issue**: Build requires GTK/WebKit dev packages even for headless
- **Solution**: Include in builder stage:
  ```
  libgtk-3-dev
  libwebkit2gtk-4.1-dev
  libayatana-appindicator3-dev
  librsvg2-dev
  ```

### 5. Cross-Compilation vs Native Build
- **Issue**: QEMU-based cross-compilation for ARM64 is extremely slow
- **Solution**: Build directly on target ARM64 device (Pi5 has enough resources)
- **Impact**: Native ARM64 build ~30 min vs estimated 2+ hours with QEMU

### 6. Docker Context Size
- **Issue**: Copying entire `src-tauri` with `target/` folder is huge (~50GB)
- **Solution**: Only copy essential files, exclude `target/` directory
- **Impact**: Reduced transfer time from hours to seconds

### 7. Cargo Build Output Suppression
- **Issue**: Dockerfile uses `2>/dev/null` to suppress cargo output for cleaner logs
- **Impact**: Makes debugging harder; remove for troubleshooting builds

## Quick Start

### Prerequisites on Target Server

```bash
# Required
apt install docker.io docker-compose-v2

# Verify
docker --version
```

### Build on Target (Recommended for ARM64)

```bash
# Copy files (exclude target folder)
scp Dockerfile user@server:~/nolan-build/
scp -r src-tauri/src src-tauri/Cargo.* src-tauri/build.rs src-tauri/tauri.conf.json src-tauri/capabilities src-tauri/icons user@server:~/nolan-build/src-tauri/

# SSH to server and build
ssh user@server
cd ~/nolan-build
docker build -t nolan-server:latest .  # ~30 min on Pi5
```

### Deploy

```bash
# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  nolan:
    image: nolan-server:latest
    container_name: nolan-server
    restart: unless-stopped
    ports:
      - "3030:3030"
    environment:
      - NOLAN_API_HOST=0.0.0.0
      - NOLAN_API_PORT=3030
      - RUST_LOG=info
    volumes:
      - nolan-data:/root/.nolan
      - nolan-projects:/projects
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3030/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s

volumes:
  nolan-data:
  nolan-projects:
EOF

# Start
docker compose up -d

# Check logs
docker compose logs -f
```

### Access

```bash
# Replace with your server's actual IP
curl http://192.168.1.87:3030/health

# Or use SSH tunnel for secure access
ssh -L 3030:localhost:3030 user@server
curl http://localhost:3030/health
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NOLAN_API_HOST` | `127.0.0.1` | Bind address (use `0.0.0.0` for network access) |
| `NOLAN_API_PORT` | `3030` | API server port |
| `RUST_LOG` | - | Log level (e.g., `info`, `debug`) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL (optional) |
| `OLLAMA_MODEL` | `qwen2.5:1.5b` | Default Ollama model (optional) |

## Future Optimizations

1. **Reduce Image Size**
   - Create separate headless crate without Tauri dependency
   - Use Alpine-based image (requires musl build)
   - Strip binary with `strip --strip-all`

2. **Faster Builds**
   - Use `cargo-chef` for better dependency caching
   - Pre-build dependencies in separate image
   - Use sccache for distributed compilation cache

3. **Multi-arch Registry**
   - Push to container registry with multi-arch manifest
   - Avoid building on target device

## Troubleshooting

### "cannot open shared object file: libgdk-3.so.0"
Missing GTK runtime libraries. Ensure runtime image includes:
```dockerfile
RUN apt-get install -y libgtk-3-0 libwebkit2gtk-4.1-0 libayatana-appindicator3-1
```

### Cronos "Invalid root path" Warning
Expected when no data directory is mounted. Mount a volume to `/root/.nolan`:
```yaml
volumes:
  - nolan-data:/root/.nolan
```

### Build Fails with "edition2024 required"
Update Rust version in Dockerfile:
```dockerfile
FROM rust:1.85-bookworm AS builder
```

### Claude CLI Not Found
Ensure PATH includes Claude:
```dockerfile
ENV PATH="/root/.claude/bin:${PATH}"
```
