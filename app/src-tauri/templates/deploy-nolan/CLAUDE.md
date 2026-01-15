# Deploy Nolan Agent

## Purpose

Package and deploy the Nolan application. This agent handles the deployment pipeline from built artifacts to distribution.

## Working Directory

This agent operates in: `/home/mmartin/Proyectos/nolan/app`

## Pre-Deployment Checks

### Step 1: Verify Build Exists

Before deploying, confirm the build is complete:

```bash
# Check frontend build
if [ ! -d "/home/mmartin/Proyectos/nolan/app/dist" ]; then
  echo "ERROR: Frontend not built. Run build first."
  exit 1
fi

# Check backend build
if [ ! -f "/home/mmartin/Proyectos/nolan/app/src-tauri/target/release/nolan" ]; then
  echo "ERROR: Backend not built. Run build first."
  exit 1
fi

echo "Build artifacts verified."
```

### Step 2: Check Version

Verify version information:

```bash
# Read version from package.json
grep '"version"' /home/mmartin/Proyectos/nolan/app/package.json

# Read version from Cargo.toml
grep '^version' /home/mmartin/Proyectos/nolan/app/src-tauri/Cargo.toml
```

Ensure versions match. If they don't, report the discrepancy.

### Step 3: Git Status Check

Verify clean working state:

```bash
cd /home/mmartin/Proyectos/nolan
git status --porcelain
```

**If uncommitted changes exist:**
- Report which files are modified
- Ask for confirmation before proceeding
- DO NOT commit changes automatically

## Deployment Options

### Option A: Tauri Bundle (Recommended)

Create a distributable application bundle:

```bash
cd /home/mmartin/Proyectos/nolan/app
npm run tauri build
```

**Expected Outputs:**
- Linux: `.deb`, `.AppImage` in `src-tauri/target/release/bundle/`
- macOS: `.dmg`, `.app` in `src-tauri/target/release/bundle/`
- Windows: `.msi`, `.exe` in `src-tauri/target/release/bundle/`

### Option B: Development Server

For local testing only:

```bash
cd /home/mmartin/Proyectos/nolan/app
npm run tauri dev
```

**Note:** This is for testing, not deployment.

## Post-Deployment Verification

### Verify Bundle Created

```bash
ls -la /home/mmartin/Proyectos/nolan/app/src-tauri/target/release/bundle/
```

### Check Bundle Integrity

For AppImage:
```bash
file /home/mmartin/Proyectos/nolan/app/src-tauri/target/release/bundle/appimage/*.AppImage
```

For .deb:
```bash
dpkg-deb --info /home/mmartin/Proyectos/nolan/app/src-tauri/target/release/bundle/deb/*.deb
```

## Deployment Report

Generate a deployment summary:

```markdown
# Deployment Report

**Date:** {timestamp}
**Version:** {version}
**Platform:** {linux|macos|windows}

## Artifacts Created
- [ ] {artifact1} - {size}
- [ ] {artifact2} - {size}

## Checksums
- {artifact1}: {sha256}
- {artifact2}: {sha256}

## Verification
- Build verification: PASS/FAIL
- Bundle creation: PASS/FAIL
- Integrity check: PASS/FAIL

## Next Steps
- [ ] Upload to release server
- [ ] Update changelog
- [ ] Notify users
```

## Error Handling

### Common Issues

1. **Missing build artifacts**
   - Run `/build` first
   - Verify build succeeded

2. **Bundle signing fails**
   - Check signing certificates
   - May need manual signing step

3. **Permission denied**
   - Check file permissions
   - May need sudo for system directories

## Constraints

- DO NOT push to git repositories
- DO NOT upload to external servers without explicit confirmation
- DO NOT modify production configurations
- DO NOT delete existing releases
- Maximum 2 file edits (version files only)

## Security Notes

- Never include `.env` files in bundles
- Verify no secrets in build artifacts
- Check bundle doesn't expose sensitive paths
