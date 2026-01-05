#!/bin/bash
# Modified test using capture-pane for verification (since pipe-pane doesn't work with Claude Code)
# BUG DOCUMENTED: tmux pipe-pane does NOT capture Claude Code terminal output

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Test configuration
TEST_AGENT="${TEST_AGENT:-ralph-5}"
SESSION="agent-$TEST_AGENT"
LOG_FILE="/tmp/team-aliases-audit-$(date +%Y%m%d_%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Counters
TOTAL=0
PASSED=0
FAILED=0

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG_FILE"; }
pass() { ((PASSED++)); ((TOTAL++)); echo -e "${GREEN}PASS${NC}: $1" | tee -a "$LOG_FILE"; }
fail() { ((FAILED++)); ((TOTAL++)); echo -e "${RED}FAIL${NC}: $1 - $2" | tee -a "$LOG_FILE"; }
info() { echo -e "${CYAN}INFO${NC}: $*" | tee -a "$LOG_FILE"; }
separator() { echo "========================================" | tee -a "$LOG_FILE"; }

# Generate message ID
msg_id() {
    echo "TEST_$(date +%s%N | sha256sum | cut -c1-8)"
}

# Exit copy mode if active
exit_copy_mode() {
    local in_mode=$(tmux display-message -t "$SESSION" -p '#{pane_in_mode}' 2>/dev/null)
    [ "$in_mode" = "1" ] || return 0
    tmux send-keys -t "$SESSION" q
    sleep 0.1
    in_mode=$(tmux display-message -t "$SESSION" -p '#{pane_in_mode}' 2>/dev/null)
    [ "$in_mode" = "1" ] && tmux send-keys -t "$SESSION" Escape
    sleep 0.1
}

# Send message with plain send-keys
send_msg() {
    local msg="$1"
    exit_copy_mode
    tmux send-keys -t "$SESSION" -l "$msg"
    sleep 0.03
    tmux send-keys -t "$SESSION" C-m
}

# Verify message delivery using capture-pane
verify_delivery() {
    local msg_id="$1"
    local timeout="${2:-5}"
    local deadline=$(($(date +%s) + timeout))

    while [ $(date +%s) -lt $deadline ]; do
        if tmux capture-pane -t "$SESSION" -p -S -100 2>/dev/null | grep -q "$msg_id"; then
            return 0
        fi
        sleep 0.3
    done
    return 1
}

# Run test with verification
run_test() {
    local name="$1"
    local message="$2"
    local timeout="${3:-5}"

    local id=$(msg_id)
    local full_msg="${id}: ${message}"

    local start=$(date +%s%N)
    send_msg "$full_msg"

    if verify_delivery "$id" "$timeout"; then
        local end=$(date +%s%N)
        local duration=$(( (end - start) / 1000000 ))
        pass "$name (${duration}ms)"
        return 0
    else
        fail "$name" "not found in capture-pane within ${timeout}s"
        return 1
    fi
}

# ===== TEST SUITE 1: MESSAGE SIZES =====
test_sizes() {
    separator
    log "TEST SUITE 1: Message Size Variations"
    separator

    run_test "SIZE_1char" "X"
    sleep 0.5
    run_test "SIZE_10char" "0123456789"
    sleep 0.5
    run_test "SIZE_50char" "$(printf 'A%.0s' {1..50})"
    sleep 0.5
    run_test "SIZE_100char" "$(printf 'B%.0s' {1..100})"
    sleep 0.5
    run_test "SIZE_200char" "$(printf 'C%.0s' {1..200})"
    sleep 0.5
    run_test "SIZE_500char" "$(printf 'D%.0s' {1..500})" 8
    sleep 0.5
    run_test "SIZE_1000char" "$(printf 'E%.0s' {1..1000})" 10
    sleep 1
}

# ===== TEST SUITE 2: SPECIAL CHARACTERS =====
test_characters() {
    separator
    log "TEST SUITE 2: Special Characters"
    separator

    run_test "CHAR_punctuation" "Hello! How are you? Great..."
    sleep 0.5
    run_test "CHAR_quotes" 'Double "quotes" and single '\''quotes'\'''
    sleep 0.5
    run_test "CHAR_shell" 'Variables $HOME $(cmd) `backtick`'
    sleep 0.5
    run_test "CHAR_pipes" "Pipe | and && and || and semicolon ;"
    sleep 0.5
    run_test "CHAR_brackets" "Array[0] Object{key} (parens)"
    sleep 0.5
    run_test "CHAR_math" "Calc: 5 + 3 * 2 / 1 - 4 % 2 = result"
    sleep 0.5
    run_test "CHAR_paths" "/path/to/file.txt and C:\\Windows\\path"
    sleep 0.5
    run_test "CHAR_hash" "Test #hashtag and ## double hash"
    sleep 0.5
    run_test "CHAR_unicode" "Café naïve résumé"
    sleep 0.5
    run_test "CHAR_emoji" "Test emoji 🚀 💻 🎉 here"
    sleep 0.5
    run_test "CHAR_cjk" "日本語 中文 한국어"
    sleep 1
}

# ===== TEST SUITE 3: RAPID-FIRE =====
test_rapidfire() {
    separator
    log "TEST SUITE 3: Rapid-Fire Messaging"
    separator

    info "Sending 5 messages rapidly (no delay)..."
    local rf_passed=0
    local ids=()
    for i in {1..5}; do
        local id=$(msg_id)
        ids+=("$id")
        send_msg "${id}: RAPID_$i message"
    done

    sleep 3

    for i in {0..4}; do
        if tmux capture-pane -t "$SESSION" -p -S -200 | grep -q "${ids[$i]}"; then
            ((rf_passed++))
        fi
    done

    if [ $rf_passed -eq 5 ]; then
        pass "RAPID_5burst ($rf_passed/5 received)"
    else
        fail "RAPID_5burst" "$rf_passed/5 received"
    fi

    sleep 2

    info "Sending 10 messages at 50ms intervals..."
    rf_passed=0
    ids=()
    for i in {1..10}; do
        local id=$(msg_id)
        ids+=("$id")
        send_msg "${id}: RAPID10_$i msg"
        sleep 0.05
    done

    sleep 4

    for i in {0..9}; do
        if tmux capture-pane -t "$SESSION" -p -S -300 | grep -q "${ids[$i]}"; then
            ((rf_passed++))
        fi
    done

    if [ $rf_passed -ge 9 ]; then
        pass "RAPID_10x50ms ($rf_passed/10 received)"
    else
        fail "RAPID_10x50ms" "$rf_passed/10 received"
    fi

    sleep 2
}

# ===== TEST SUITE 4: PARALLEL =====
test_parallel() {
    separator
    log "TEST SUITE 4: Parallel Message Delivery"
    separator

    info "Sending 3 messages in parallel..."
    local ids=()
    for i in {1..3}; do
        local id=$(msg_id)
        ids+=("$id")
        (send_msg "${id}: PARALLEL3_$i concurrent") &
    done
    wait

    sleep 3

    local p_passed=0
    for i in {0..2}; do
        if tmux capture-pane -t "$SESSION" -p -S -200 | grep -q "${ids[$i]}"; then
            ((p_passed++))
        fi
    done

    if [ $p_passed -eq 3 ]; then
        pass "PARALLEL_3 ($p_passed/3 delivered)"
    else
        fail "PARALLEL_3" "$p_passed/3 delivered"
    fi

    sleep 2

    info "Sending 5 messages in parallel..."
    ids=()
    for i in {1..5}; do
        local id=$(msg_id)
        ids+=("$id")
        (send_msg "${id}: PARALLEL5_$i concurrent") &
    done
    wait

    sleep 4

    p_passed=0
    for i in {0..4}; do
        if tmux capture-pane -t "$SESSION" -p -S -300 | grep -q "${ids[$i]}"; then
            ((p_passed++))
        fi
    done

    if [ $p_passed -ge 4 ]; then
        pass "PARALLEL_5 ($p_passed/5 delivered)"
    else
        fail "PARALLEL_5" "$p_passed/5 delivered"
    fi

    sleep 2
}

# ===== TEST SUITE 5: SCROLL/COPY MODE =====
test_scroll() {
    separator
    log "TEST SUITE 5: Copy Mode / Scroll Handling"
    separator

    info "Testing message delivery after entering copy mode..."
    tmux send-keys -t "$SESSION" C-b [
    sleep 0.5

    run_test "SCROLL_from_copy_mode" "Message after copy mode" 8

    sleep 1

    info "Testing after scroll-up in copy mode..."
    tmux send-keys -t "$SESSION" C-b [
    tmux send-keys -t "$SESSION" C-u
    sleep 0.3

    run_test "SCROLL_after_pageup" "Message after page up" 8

    sleep 1
}

# ===== TEST SUITE 6: EDGE CASES =====
test_edge() {
    separator
    log "TEST SUITE 6: Edge Cases"
    separator

    run_test "EDGE_spaces" "   spaces only   "
    sleep 0.5
    run_test "EDGE_longword" "$(printf 'a%.0s' {1..150})"
    sleep 0.5
    run_test "EDGE_special_start" "!@#\$%^&*() starts with special"
    sleep 0.5
    run_test "EDGE_numbers_only" "1234567890123456789012345678901234567890"
    sleep 0.5
    run_test "EDGE_json" '{"key": "value", "arr": [1,2,3]}'
    sleep 0.5
    run_test "EDGE_url" "https://example.com/path?q=1&x=2"
    sleep 0.5
    run_test "EDGE_code" 'function foo() { return 42; }'
    sleep 1
}

# ===== TEST SUITE 7: INTERRUPT RECOVERY =====
test_interrupt() {
    separator
    log "TEST SUITE 7: Interrupt Recovery"
    separator

    info "Testing message after sending Ctrl+C..."
    tmux send-keys -t "$SESSION" C-c
    sleep 0.5

    run_test "INTERRUPT_after_ctrlc" "Message after Ctrl+C" 8

    sleep 1

    info "Testing message after Escape key..."
    tmux send-keys -t "$SESSION" Escape
    sleep 0.3

    run_test "INTERRUPT_after_escape" "Message after Escape" 8

    sleep 1
}

# ===== REPORT =====
generate_report() {
    separator
    log "TEST REPORT"
    separator

    echo ""
    echo "============================================"
    echo "TEAM-ALIASES.SH QA AUDIT RESULTS"
    echo "============================================"
    echo "Test Agent: $TEST_AGENT"
    echo "Date: $(date)"
    echo "Log: $LOG_FILE"
    echo ""
    echo "RESULTS:"
    echo "  Total:  $TOTAL"
    echo "  Passed: $PASSED"
    echo "  Failed: $FAILED"
    echo "  Rate:   $(( PASSED * 100 / TOTAL ))%"
    echo ""
    echo "CRITICAL BUGS FOUND:"
    echo "  1. pipe-pane does NOT capture Claude Code output"
    echo "     - Delivery confirmation via output log DOES NOT WORK"
    echo "     - All 'Delivered' confirmations are FALSE POSITIVES"
    echo "     - Must use capture-pane instead for verification"
    echo ""
    echo "============================================"

    [ $FAILED -eq 0 ]
}

# ===== MAIN =====
main() {
    log "Starting team-aliases.sh QA audit"
    log "Target: $TEST_AGENT"
    log "Session: $SESSION"

    # Verify target exists
    if ! tmux has-session -t "$SESSION" 2>/dev/null; then
        echo "ERROR: Session '$SESSION' not found!"
        exit 1
    fi

    test_sizes
    test_characters
    test_rapidfire
    test_parallel
    test_scroll
    test_edge
    test_interrupt

    generate_report
}

main "$@"
