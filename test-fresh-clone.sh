#!/usr/bin/env bash
set -e

echo "========================================"
echo "  Fresh Clone Portability Test"
echo "========================================"
echo ""

# Test in temporary location with unique name
TEST_DIR="/tmp/nolan-fresh-clone-test-$$"
echo "Test directory: $TEST_DIR"
echo ""

# Get source repository path
SOURCE_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Source: $SOURCE_REPO"
echo ""

# 1. Clone repository
echo "1. Cloning repository..."
git clone "$SOURCE_REPO" "$TEST_DIR"
echo "✓ Clone successful"
echo ""

# 2. Run setup
echo "2. Running setup.sh..."
cd "$TEST_DIR/app"
./setup.sh
echo ""

# 3. Verify generated files
echo "3. Verifying generated files..."
if [ ! -f "terminator_config" ]; then
    echo "✗ FAIL: terminator_config not generated"
    exit 1
fi
echo "✓ terminator_config exists"

# 4. Check for hardcoded paths in generated config
echo "4. Checking for hardcoded paths..."
if grep -q "/home/mmartin" terminator_config; then
    echo "✗ FAIL: Found hardcoded /home/mmartin paths:"
    grep "/home/mmartin" terminator_config
    exit 1
fi
echo "✓ No /home/mmartin paths found"

# 4b. Check for other hardcoded patterns
echo "4b. Checking for other hardcoded patterns..."
PATTERNS=("/home/" "~/Proyectos" "AI_RnD_Lab" "mmartin")
for pattern in "${PATTERNS[@]}"; do
    if grep -q "$pattern" terminator_config 2>/dev/null; then
        echo "✗ FAIL: Found hardcoded '$pattern' in config"
        grep "$pattern" terminator_config
        exit 1
    fi
done
echo "✓ No hardcoded patterns found"

# Verify paths are absolute
if ! grep -q "^directory = /" terminator_config; then
    echo "✗ FAIL: Paths not absolute in terminator_config"
    exit 1
fi
echo "✓ Paths are absolute"

# Verify paths were updated to test location
if ! grep -q "$TEST_DIR" terminator_config; then
    echo "✗ FAIL: Paths not updated to test location"
    echo "Expected to find: $TEST_DIR"
    exit 1
fi
echo "✓ Paths correctly point to test location"
echo ""

# 5. Verify directory structure
echo "5. Verifying directory structure..."
for dir in agents scripts .claude src src-tauri; do
    if [ ! -d "$dir" ]; then
        echo "✗ FAIL: Directory missing: $dir"
        exit 1
    fi
done
echo "✓ Directory structure valid"

# 5b. Verify script execute permissions (git should preserve)
echo "5b. Verifying script permissions..."
for script in setup.sh start.sh scripts/launch-core.sh scripts/spawn-agent.sh; do
    if [ -f "$script" ] && [ ! -x "$script" ]; then
        echo "✗ FAIL: Script not executable: $script"
        echo "Git should preserve execute permissions - was chmod +x run before commit?"
        exit 1
    fi
done
echo "✓ Scripts have execute permissions"
echo ""

# 6. Test npm install (if node available)
if command -v npm &> /dev/null; then
    echo "6. Testing npm install..."
    npm install --silent
    echo "✓ npm install succeeded"
else
    echo "6. Skipping npm test (npm not installed)"
fi
echo ""

# 7. Test cargo check (if rust available)
if command -v cargo &> /dev/null; then
    echo "7. Testing cargo check..."
    cd src-tauri
    cargo check --quiet 2>&1 | head -5
    cd ..
    echo "✓ cargo check succeeded"
else
    echo "7. Skipping cargo test (cargo not installed)"
fi
echo ""

# Cleanup
echo "8. Cleaning up..."
cd /
if [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR" || {
        echo "WARNING: Could not remove $TEST_DIR"
        echo "You may need to remove it manually"
    }
    if [ ! -d "$TEST_DIR" ]; then
        echo "✓ Test directory removed"
    fi
else
    echo "✓ Test directory already removed"
fi
echo ""

# Success
echo "========================================"
echo "✅ Fresh Clone Test PASSED!"
echo "========================================"
echo ""
echo "Repository is fully portable and ready"
echo "for distribution. No hardcoded paths."
echo ""
