# CLAUDE.md

---

# Development Guide

## Project Overview

**Nolan** is a Tauri-based desktop application that serves as an AI agent control panel and management system. It provides a GUI for monitoring, launching, and coordinating AI agents, with live output streaming, project management, session history, and usage tracking.

## Build & Development Commands

### Full Stack Development

```bash
# Install dependencies
npm install

# Run dev server (frontend) - runs at http://localhost:1420
npm run dev

# Build frontend only
npm run build

# In parallel terminal: Build and run Tauri desktop app
npm run tauri dev     # Hot reloads on frontend changes

# Build release binary
npm run tauri build
```

### Frontend-Only Development

```bash
npm run dev           # Runs Vite dev server (requires mock backend data)
```

### Type Checking

```bash
tsc                   # Check TypeScript in frontend
cd src-tauri && cargo check  # Check Rust backend
```

### Build Diagnostics

- Frontend builds use Vite and output to `dist/`
- Tauri builds Rust backend and bundles the frontend
- Check build output in `src-tauri/target/` for Rust artifacts
- The final binary location: `src-tauri/target/release/nolan`