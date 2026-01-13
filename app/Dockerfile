# Nolan Headless Server - Multi-arch Docker Build
# Supports both x86_64 and ARM64 (Raspberry Pi 5)
#
# Build Times (measured 2026-01-13):
#   x86_64 (i7-12700):  ~5 min total (deps: 2min, nolan: 1min)
#   ARM64 (Pi5 native): ~30 min total (deps: 19min, nolan: 8min)
#   ARM64 (QEMU cross): ~2+ hours (not recommended)
#
# Image Size: ~1.3-1.4 GB (GTK runtime libs add ~800MB)
#
# Build:
#   docker build -t nolan-server .
#
# Build for ARM64 - RECOMMENDED: build on target device (much faster than QEMU):
#   scp -r src-tauri/{src,Cargo.*,build.rs,tauri.conf.json,capabilities,icons} user@pi:/build/src-tauri/
#   ssh user@pi "cd /build && docker build -t nolan-server ."
#
# Run:
#   docker run -d --name nolan \
#     -p 3030:3030 \
#     -v /path/to/projects:/projects \
#     -v nolan-data:/home/nolan/.nolan \
#     nolan-server
#
# See DEPLOYMENT.md for full documentation and troubleshooting.

# ==============================================================================
# Stage 1: Build the Rust binary
# ==============================================================================
# IMPORTANT: Rust 1.85+ required for edition 2024 (tokio-cron-scheduler dependency)
# Using bookworm (Debian 12) for glibc compatibility
FROM rust:1.85-bookworm AS builder

WORKDIR /build

# Install build dependencies
# NOTE: GTK/WebKit dev packages required because Tauri links against them at compile time,
# even for the headless server binary. Future optimization: create separate crate without Tauri.
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy only Cargo files first for better layer caching
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock* ./src-tauri/

# Create a dummy main.rs to build dependencies
RUN mkdir -p src-tauri/src/bin && \
    echo "fn main() {}" > src-tauri/src/main.rs && \
    echo "pub fn run() {}" > src-tauri/src/lib.rs && \
    echo "fn main() {}" > src-tauri/src/bin/server.rs

# Build dependencies only (cached layer)
WORKDIR /build/src-tauri
RUN cargo build --release --bin nolan-server 2>/dev/null || true

# Copy actual source code
WORKDIR /build
COPY src-tauri ./src-tauri

# Build the actual binary
WORKDIR /build/src-tauri
RUN cargo build --release --bin nolan-server

# ==============================================================================
# Stage 2: Runtime image
# ==============================================================================
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
# - bash: Required for Claude CLI installer (dash doesn't support all syntax)
# - tmux: Agent session management (core dependency)
# - git: Worktree operations for isolated agent execution
# - GTK libs: Required at runtime because Tauri binary links against them (~800MB)
RUN apt-get update && apt-get install -y \
    bash \
    tmux \
    git \
    curl \
    ca-certificates \
    libgtk-3-0 \
    libwebkit2gtk-4.1-0 \
    libayatana-appindicator3-1 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for running the server
# Claude CLI refuses --dangerously-skip-permissions as root
RUN useradd -m -s /bin/bash -u 1000 nolan

# Install Claude CLI as nolan user
USER nolan
RUN curl -fsSL https://claude.ai/install.sh | bash
USER root

# Create app directories with proper ownership
RUN mkdir -p /nolan/app /nolan/cronos/agents /projects && \
    chown -R nolan:nolan /nolan /projects

WORKDIR /nolan/app

# Copy the compiled binary from builder
COPY --from=builder /build/src-tauri/target/release/nolan-server /nolan/app/nolan-server

# Copy entrypoint script
COPY docker-entrypoint.sh /nolan/app/docker-entrypoint.sh
RUN chmod +x /nolan/app/docker-entrypoint.sh && \
    chown nolan:nolan /nolan/app/nolan-server /nolan/app/docker-entrypoint.sh

# Environment variables
# Claude CLI installs to ~/.local/bin
ENV PATH="/home/nolan/.local/bin:${PATH}"
ENV HOME=/home/nolan
ENV NOLAN_API_HOST=0.0.0.0
ENV NOLAN_API_PORT=3030
ENV NOLAN_DATA_ROOT=/home/nolan/.nolan
# NOLAN_APP_ROOT must have a parent (nolan_root) for cronos to work
# nolan_root/cronos/agents is where cron agent definitions live
ENV NOLAN_APP_ROOT=/nolan/app
ENV RUST_LOG=info

# Switch to non-root user
USER nolan

# Expose the API port
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3030/health || exit 1

# Entrypoint initializes data directories, then runs CMD
ENTRYPOINT ["/nolan/app/docker-entrypoint.sh"]
CMD ["/nolan/app/nolan-server"]
