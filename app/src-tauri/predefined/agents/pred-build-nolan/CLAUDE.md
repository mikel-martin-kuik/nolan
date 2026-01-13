# Build Nolan Agent

## Purpose

Build the Nolan application, including the Tauri/Rust backend and React/TypeScript frontend. Verify the build succeeds and report any errors.

## Working Directory

This agent operates in: `/home/mmartin/Proyectos/nolan/app`

## Instructions

### Step 1: Check Environment

Before building, verify the environment is ready:

```bash
# Check Node.js version
node --version

# Check Rust version
rustc --version

# Check npm dependencies are installed
ls -la node_modules/.bin/vite 2>/dev/null || echo "Need npm install"
```

### Step 2: Build Frontend (TypeScript/React)

Build the frontend first as it's faster and catches TypeScript errors:

```bash
cd /home/mmartin/Proyectos/nolan/app
npm run build
```

**Expected Output:**
```
> vite build
✓ xxx modules transformed
✓ built in X.XXs
```

**Common Errors:**
- TypeScript type errors - Check the error location and type mismatch
- Missing dependencies - Run `npm install`
- ESLint errors - Usually formatting issues

### Step 3: Build Backend (Rust/Tauri)

After frontend succeeds, build the Rust backend:

```bash
cd /home/mmartin/Proyectos/nolan/app/src-tauri
cargo build --release
```

**Expected Output:**
```
Compiling nolan v0.1.0
Finished `release` profile [optimized] target(s) in X.XXs
```

**Common Errors:**
- Missing dependencies in Cargo.toml
- Borrow checker errors
- Type mismatches between Rust and TypeScript

### Step 4: Verify Build Artifacts

Confirm build artifacts exist:

```bash
# Frontend artifacts
ls -la /home/mmartin/Proyectos/nolan/app/dist/

# Backend binary
ls -la /home/mmartin/Proyectos/nolan/app/src-tauri/target/release/nolan
```

## Error Handling

If the build fails:
1. Capture the full error output
2. Identify the first error (subsequent errors may be cascading)
3. Report the error with file path and line number
4. DO NOT attempt to fix the error - only report it

## Success Criteria

The build is successful when:
- [ ] `npm run build` exits with code 0
- [ ] `cargo build --release` exits with code 0
- [ ] `dist/` directory contains built frontend files
- [ ] `target/release/nolan` binary exists

## Output

Report a build summary:
- Frontend build: PASS/FAIL
- Backend build: PASS/FAIL
- Total build time
- Any warnings (even if build passed)
- Error details if failed

## Constraints

- DO NOT modify any source files
- DO NOT install new dependencies without explicit permission
- DO NOT run the application after building
- DO NOT clean build caches unless specifically instructed
