#!/bin/bash

##############################################################################
# Quick Fix Agent
#
# Identifies and fixes common code issues including:
# - Linting errors and formatting problems
# - Type checking errors
# - Rust code quality issues
# - Python code issues
#
# Usage: ./main.sh [project_root]
##############################################################################

set -e

# Configuration
PROJECT_ROOT="${1:-/home/mmartin/Proyectos/nolan}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${PROJECT_ROOT}/.quick-fix-report-${TIMESTAMP}.md"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Tracking variables
TYPESCRIPT_AUTO_FIXES=0
TYPESCRIPT_MANUAL_FIXES=0
TYPESCRIPT_ERRORS=0
RUST_FIXES=0
RUST_ERRORS=0
PYTHON_FIXES=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Report header
create_report_header() {
    cat > "$REPORT_FILE" << 'EOF'
# Quick Fix Agent Report

Generated: $(date)
Project: /home/mmartin/Proyectos/nolan

---

## Summary

EOF
}

append_to_report() {
    echo "$1" >> "$REPORT_FILE"
}

##############################################################################
# Phase 1: Project Analysis
##############################################################################
phase_analyze() {
    log_info "=== Phase 1: Project Analysis ==="

    local has_frontend=false
    local has_backend=false
    local has_python=false

    # Check for TypeScript/JavaScript frontend
    if [[ -f "${PROJECT_ROOT}/app/package.json" ]]; then
        log_success "Found TypeScript/JavaScript frontend (package.json)"
        has_frontend=true
    fi

    # Check for Rust backend
    if [[ -f "${PROJECT_ROOT}/app/src-tauri/Cargo.toml" ]]; then
        log_success "Found Rust backend (Cargo.toml)"
        has_backend=true
    fi

    # Check for Python scripts
    if find "${PROJECT_ROOT}/app/scripts" "${PROJECT_ROOT}/scripts" -name "*.py" 2>/dev/null | grep -q .; then
        log_success "Found Python scripts"
        has_python=true
    fi

    append_to_report "### Detected Project Types"
    append_to_report "- TypeScript/JavaScript Frontend: $([ "$has_frontend" = true ] && echo "✅ Yes" || echo "❌ No")"
    append_to_report "- Rust Backend: $([ "$has_backend" = true ] && echo "✅ Yes" || echo "❌ No")"
    append_to_report "- Python Scripts: $([ "$has_python" = true ] && echo "✅ Yes" || echo "❌ No")"
    append_to_report ""

    log_success "Project analysis complete"
}

##############################################################################
# Phase 2: TypeScript/JavaScript Linting
##############################################################################
phase_lint_typescript() {
    log_info "=== Phase 2: TypeScript/JavaScript Linting ==="

    local frontend_dir="${PROJECT_ROOT}/app"

    if [[ ! -f "${frontend_dir}/package.json" ]]; then
        log_warn "No package.json found, skipping TypeScript/JavaScript phase"
        append_to_report "### TypeScript/JavaScript"
        append_to_report "Skipped (no package.json found)"
        append_to_report ""
        return 0
    fi

    cd "$frontend_dir"

    # Install dependencies
    log_info "Installing dependencies..."
    if npm ci --silent 2>/dev/null; then
        log_success "Dependencies installed"
    else
        log_warn "Failed to install dependencies, attempting with npm install"
        npm install --silent 2>/dev/null || log_warn "Dependency installation had issues"
    fi

    # Run ESLint with auto-fix
    log_info "Running ESLint with auto-fix..."
    append_to_report "### TypeScript/JavaScript"

    if npx eslint src/ --fix --quiet 2>/dev/null; then
        TYPESCRIPT_AUTO_FIXES=$((TYPESCRIPT_AUTO_FIXES + 1))
        log_success "ESLint auto-fix completed"
        append_to_report "- ✅ ESLint auto-fix: Completed"
    else
        log_warn "ESLint returned errors (may be unfixable issues)"
        append_to_report "- ⚠️ ESLint: Some issues remain"
    fi

    # Run TypeScript type checking
    log_info "Running TypeScript type checker..."
    if npm run build 2>&1 | tee /tmp/ts-errors.log; then
        log_success "TypeScript compilation successful"
        append_to_report "- ✅ TypeScript Build: PASS"
    else
        log_error "TypeScript compilation found errors"
        TYPESCRIPT_ERRORS=$((TYPESCRIPT_ERRORS + 1))
        append_to_report "- ❌ TypeScript Build: FAIL"
        append_to_report "  \`\`\`"
        tail -20 /tmp/ts-errors.log | sed 's/^/  /'  >> "$REPORT_FILE"
        append_to_report "  \`\`\`"
    fi

    append_to_report ""
    cd - > /dev/null
    log_success "TypeScript/JavaScript phase complete"
}

##############################################################################
# Phase 3: Rust Linting and Formatting
##############################################################################
phase_lint_rust() {
    log_info "=== Phase 3: Rust Linting and Formatting ==="

    local rust_dir="${PROJECT_ROOT}/app/src-tauri"

    if [[ ! -f "${rust_dir}/Cargo.toml" ]]; then
        log_warn "No Cargo.toml found, skipping Rust phase"
        append_to_report "### Rust Backend"
        append_to_report "Skipped (no Cargo.toml found)"
        append_to_report ""
        return 0
    fi

    cd "$rust_dir"

    append_to_report "### Rust Backend"

    # Run cargo fmt
    log_info "Running cargo fmt..."
    if cargo fmt --all 2>&1 | grep -q "Reformatted"; then
        RUST_FIXES=$((RUST_FIXES + 1))
        log_success "Cargo fmt applied formatting"
        append_to_report "- ✅ cargo fmt: Formatting applied"
    else
        log_success "Cargo fmt: No formatting changes needed"
        append_to_report "- ✅ cargo fmt: Code already formatted"
    fi

    # Run cargo clippy
    log_info "Running cargo clippy..."
    if cargo clippy --all-targets --all-features 2>&1 | tee /tmp/clippy-output.log | grep -q "warning:"; then
        log_warn "Clippy found warnings"
        local warning_count=$(grep -c "warning:" /tmp/clippy-output.log || echo "0")
        RUST_ERRORS=$((RUST_ERRORS + warning_count))
        append_to_report "- ⚠️ cargo clippy: $warning_count warnings found"
        append_to_report "  Top warnings:"
        grep "warning:" /tmp/clippy-output.log | head -5 | sed 's/^/    /' >> "$REPORT_FILE"
    else
        log_success "Cargo clippy: No warnings"
        append_to_report "- ✅ cargo clippy: No warnings"
    fi

    append_to_report ""
    cd - > /dev/null
    log_success "Rust phase complete"
}

##############################################################################
# Phase 4: Python Linting
##############################################################################
phase_lint_python() {
    log_info "=== Phase 4: Python Linting ==="

    append_to_report "### Python Scripts"

    # Check if ruff is available
    if ! command -v ruff &> /dev/null; then
        log_warn "ruff not available, skipping Python linting"
        append_to_report "- ⏭️ Skipped (ruff not available)"
        append_to_report ""
        return 0
    fi

    # Run ruff check with fix
    log_info "Running ruff check with --fix..."
    if ruff check "${PROJECT_ROOT}/app/scripts" "${PROJECT_ROOT}/scripts" --fix 2>&1 | tee /tmp/ruff-output.log; then
        local fixed=$(grep "fixed" /tmp/ruff-output.log | wc -l)
        if [[ $fixed -gt 0 ]]; then
            PYTHON_FIXES=$((PYTHON_FIXES + fixed))
            log_success "Ruff auto-fixed $fixed issues"
            append_to_report "- ✅ ruff: Fixed issues"
        else
            log_success "Ruff: No issues found"
            append_to_report "- ✅ ruff: No issues found"
        fi
    else
        log_warn "Ruff found issues"
        append_to_report "- ⚠️ ruff: Some issues remain"
    fi

    append_to_report ""
    log_success "Python phase complete"
}

##############################################################################
# Phase 5: Verification
##############################################################################
phase_verify() {
    log_info "=== Phase 5: Verification ==="

    append_to_report "## Verification Results"
    append_to_report ""

    local frontend_dir="${PROJECT_ROOT}/app"
    local rust_dir="${PROJECT_ROOT}/app/src-tauri"

    # Verify TypeScript build
    if [[ -f "${frontend_dir}/package.json" ]]; then
        log_info "Verifying TypeScript build..."
        cd "$frontend_dir"
        if npm run build 2>&1 | grep -q "error"; then
            append_to_report "- ❌ TypeScript: Build failed"
            log_error "TypeScript build verification failed"
        else
            append_to_report "- ✅ TypeScript: Build successful"
            log_success "TypeScript build verification passed"
        fi
        cd - > /dev/null
    fi

    # Verify Rust build
    if [[ -f "${rust_dir}/Cargo.toml" ]]; then
        log_info "Verifying Rust build..."
        cd "$rust_dir"
        if cargo build --all-targets 2>&1 | grep -q "error"; then
            append_to_report "- ❌ Rust: Build failed"
            log_error "Rust build verification failed"
        else
            append_to_report "- ✅ Rust: Build successful"
            log_success "Rust build verification passed"
        fi
        cd - > /dev/null
    fi

    append_to_report ""
    log_success "Verification phase complete"
}

##############################################################################
# Phase 6: Report Summary
##############################################################################
phase_report() {
    log_info "=== Phase 6: Report Summary ==="

    append_to_report "## Statistics"
    append_to_report ""
    append_to_report "- TypeScript auto-fixes: $TYPESCRIPT_AUTO_FIXES"
    append_to_report "- TypeScript manual fixes: $TYPESCRIPT_MANUAL_FIXES"
    append_to_report "- TypeScript remaining issues: $TYPESCRIPT_ERRORS"
    append_to_report "- Rust fixes: $RUST_FIXES"
    append_to_report "- Rust remaining issues: $RUST_ERRORS"
    append_to_report "- Python fixes: $PYTHON_FIXES"
    append_to_report ""

    total_fixes=$((TYPESCRIPT_AUTO_FIXES + TYPESCRIPT_MANUAL_FIXES + RUST_FIXES + PYTHON_FIXES))
    total_issues=$((TYPESCRIPT_ERRORS + RUST_ERRORS))

    append_to_report "### Overall Summary"
    append_to_report "- **Total fixes applied**: $total_fixes"
    append_to_report "- **Remaining issues**: $total_issues"
    append_to_report ""

    if [[ $total_issues -eq 0 ]]; then
        log_success "All issues fixed successfully!"
        append_to_report "✅ **Status: All issues fixed!**"
    else
        log_warn "Some issues remain that require manual attention"
        append_to_report "⚠️ **Status: Manual attention required for $total_issues issue(s)**"
    fi

    append_to_report ""
    append_to_report "---"
    append_to_report "Report generated at: $(date)"

    log_success "Report saved to: $REPORT_FILE"
}

##############################################################################
# Main Execution
##############################################################################
main() {
    log_info "Starting Quick Fix Agent"
    log_info "Project root: $PROJECT_ROOT"
    log_info ""

    # Create report file
    create_report_header

    # Execute phases
    phase_analyze
    phase_lint_typescript
    phase_lint_rust
    phase_lint_python
    phase_verify
    phase_report

    log_info ""
    log_success "Quick Fix Agent completed successfully"
    echo ""
    echo "Report: $REPORT_FILE"
}

# Run main
main "$@"
