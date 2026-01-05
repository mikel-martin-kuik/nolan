#!/bin/bash
# Comprehensive Test Suite for team-aliases.sh
# Tests: message sizes, characters, rapid-fire, parallel, interrupts, scrolling

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/team-aliases.sh"

# Test configuration
TEST_AGENT="${TEST_AGENT:-ralph-5}"
LOG_FILE="${LOG_FILE:-/tmp/team-aliases-test-$(date +%Y%m%d_%H%M%S).log}"
RESULTS_FILE="${RESULTS_FILE:-/tmp/team-aliases-test-results.txt}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
TOTAL_TESTS=0
PASSED=0
FAILED=0
WARNINGS=0

# Test result tracking
declare -A TEST_RESULTS

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG_FILE"; }
pass() { ((PASSED++)); ((TOTAL_TESTS++)); echo -e "${GREEN}PASS${NC}: $1" | tee -a "$LOG_FILE"; TEST_RESULTS["$1"]="PASS"; }
fail() { ((FAILED++)); ((TOTAL_TESTS++)); echo -e "${RED}FAIL${NC}: $1 - $2" | tee -a "$LOG_FILE"; TEST_RESULTS["$1"]="FAIL: $2"; }
warn() { ((WARNINGS++)); echo -e "${YELLOW}WARN${NC}: $1" | tee -a "$LOG_FILE"; }
separator() { echo "========================================" | tee -a "$LOG_FILE"; }

# Run a single test with timing
run_test() {
    local name="$1"
    local message="$2"
    local timeout="${3:-5}"
    local retries="${4:-2}"

    local start=$(date +%s%N)
    if send "$TEST_AGENT" "$message" "$timeout" "$retries" >> "$LOG_FILE" 2>&1; then
        local end=$(date +%s%N)
        local duration=$(( (end - start) / 1000000 ))
        pass "$name (${duration}ms)"
        return 0
    else
        fail "$name" "delivery failed"
        return 1
    fi
}

# ===== TEST SUITE 1: MESSAGE SIZE VARIATIONS =====
test_suite_sizes() {
    separator
    log "TEST SUITE 1: Message Size Variations"
    separator

    # Tiny message (1 char)
    run_test "SIZE_1char" "X"

    # Small message (10 chars)
    run_test "SIZE_10char" "0123456789"

    # Medium message (100 chars)
    run_test "SIZE_100char" "$(printf 'A%.0s' {1..100})"

    # Large message (500 chars)
    run_test "SIZE_500char" "$(printf 'B%.0s' {1..500})"

    # XL message (1000 chars)
    run_test "SIZE_1000char" "$(printf 'C%.0s' {1..1000})"

    # XXL message (2000 chars)
    run_test "SIZE_2000char" "$(printf 'D%.0s' {1..2000})"

    # Monster message (5000 chars) - stress test
    run_test "SIZE_5000char" "$(printf 'E%.0s' {1..5000})" 10 3

    sleep 1
}

# ===== TEST SUITE 2: SPECIAL CHARACTERS =====
test_suite_characters() {
    separator
    log "TEST SUITE 2: Special Characters"
    separator

    # Basic punctuation
    run_test "CHAR_punctuation" "Hello! How are you? Great."

    # Quotes and apostrophes
    run_test "CHAR_quotes" "He said \"hello\" and she's here"

    # Shell special chars (in single quotes)
    run_test "CHAR_shell_special" 'Test $HOME $(whoami) `date` & | ; < >'

    # Backslashes
    run_test "CHAR_backslash" 'Path is C:\Users\test\file'

    # Newlines (embedded)
    run_test "CHAR_newline" $'Line1\nLine2\nLine3'

    # Tabs
    run_test "CHAR_tabs" $'Col1\tCol2\tCol3'

    # Unicode basic
    run_test "CHAR_unicode_basic" "Café résumé naïve"

    # Unicode emoji
    run_test "CHAR_emoji" "Test 🚀 message 💻 here 🎉"

    # Mixed unicode
    run_test "CHAR_unicode_mixed" "日本語 中文 한국어 Ελληνικά"

    # Control characters (bell, backspace - should be handled)
    run_test "CHAR_control" $'Test\x07bell\x08backspace'

    # ANSI escape sequences
    run_test "CHAR_ansi" $'\e[31mRed\e[0m Normal'

    # Hash/pound (comment char)
    run_test "CHAR_hash" "Test #hashtag and ## more"

    # Brackets and braces
    run_test "CHAR_brackets" "Array[0] Object{key: value} (parens)"

    # Math symbols
    run_test "CHAR_math" "Result = 5 + 3 * 2 / 1 - 4 % 2"

    sleep 1
}

# ===== TEST SUITE 3: RAPID-FIRE MESSAGING =====
test_suite_rapidfire() {
    separator
    log "TEST SUITE 3: Rapid-Fire Messaging"
    separator

    local rf_passed=0
    local rf_failed=0

    # 5 messages in quick succession
    log "Sending 5 rapid messages..."
    for i in {1..5}; do
        if send "$TEST_AGENT" "RAPID_$i: Quick message $i" 3 1 >> "$LOG_FILE" 2>&1; then
            ((rf_passed++))
        else
            ((rf_failed++))
        fi
    done

    if [ $rf_failed -eq 0 ]; then
        pass "RAPID_5msg_burst ($rf_passed/5)"
    else
        fail "RAPID_5msg_burst" "$rf_failed/5 failed"
    fi

    sleep 2

    # 10 messages at 0.1s intervals
    log "Sending 10 messages at 100ms intervals..."
    rf_passed=0
    rf_failed=0
    for i in {1..10}; do
        if send "$TEST_AGENT" "RAPID10_$i: Message at $(date +%s%N)" 3 1 >> "$LOG_FILE" 2>&1; then
            ((rf_passed++))
        else
            ((rf_failed++))
        fi
        sleep 0.1
    done

    if [ $rf_failed -le 1 ]; then
        pass "RAPID_10msg_100ms ($rf_passed/10)"
    else
        fail "RAPID_10msg_100ms" "$rf_failed/10 failed"
    fi

    sleep 2
}

# ===== TEST SUITE 4: PARALLEL DELIVERY =====
test_suite_parallel() {
    separator
    log "TEST SUITE 4: Parallel Message Delivery"
    separator

    # 3 parallel sends
    log "Sending 3 parallel messages..."
    local pids=()
    for i in {1..3}; do
        send "$TEST_AGENT" "PARALLEL_3_$i: Concurrent message $i" 5 2 >> "$LOG_FILE" 2>&1 &
        pids+=($!)
    done

    local p_passed=0
    local p_failed=0
    for pid in "${pids[@]}"; do
        if wait $pid; then
            ((p_passed++))
        else
            ((p_failed++))
        fi
    done

    if [ $p_failed -eq 0 ]; then
        pass "PARALLEL_3 ($p_passed/3)"
    else
        fail "PARALLEL_3" "$p_failed/3 failed"
    fi

    sleep 2

    # 5 parallel sends
    log "Sending 5 parallel messages..."
    pids=()
    for i in {1..5}; do
        send "$TEST_AGENT" "PARALLEL_5_$i: Concurrent $i at $(date +%s%N)" 8 2 >> "$LOG_FILE" 2>&1 &
        pids+=($!)
    done

    p_passed=0
    p_failed=0
    for pid in "${pids[@]}"; do
        if wait $pid; then
            ((p_passed++))
        else
            ((p_failed++))
        fi
    done

    if [ $p_failed -le 1 ]; then
        pass "PARALLEL_5 ($p_passed/5)"
    else
        fail "PARALLEL_5" "$p_failed/5 failed"
    fi

    sleep 2
}

# ===== TEST SUITE 5: COPY MODE / SCROLL HANDLING =====
test_suite_scroll() {
    separator
    log "TEST SUITE 5: Copy Mode / Scroll Handling"
    separator

    # First, put target in copy mode
    log "Testing copy-mode exit before send..."
    tmux send-keys -t "agent-$TEST_AGENT" C-b [  # Enter copy mode
    sleep 0.5

    if run_test "SCROLL_copy_mode_exit" "Message after copy mode" 8 3; then
        log "Successfully delivered after exiting copy mode"
    fi

    sleep 1

    # Test after scrolling up
    log "Testing after scroll-up..."
    tmux send-keys -t "agent-$TEST_AGENT" C-b [
    tmux send-keys -t "agent-$TEST_AGENT" C-u  # Page up
    sleep 0.3

    if run_test "SCROLL_after_pageup" "Message after page up" 8 3; then
        log "Successfully delivered after scroll"
    fi

    sleep 1
}

# ===== TEST SUITE 6: TIMEOUT AND RETRY =====
test_suite_timeout() {
    separator
    log "TEST SUITE 6: Timeout and Retry Behavior"
    separator

    # Very short timeout (should still work for simple messages)
    local start=$(date +%s%N)
    if send "$TEST_AGENT" "TIMEOUT_short: Quick" 2 0 >> "$LOG_FILE" 2>&1; then
        local end=$(date +%s%N)
        local duration=$(( (end - start) / 1000000 ))
        pass "TIMEOUT_2s_0retry (${duration}ms)"
    else
        fail "TIMEOUT_2s_0retry" "delivery failed"
    fi

    sleep 1

    # Standard timeout
    start=$(date +%s%N)
    if send "$TEST_AGENT" "TIMEOUT_standard: Normal timing" 5 2 >> "$LOG_FILE" 2>&1; then
        local end=$(date +%s%N)
        local duration=$(( (end - start) / 1000000 ))
        pass "TIMEOUT_5s_2retry (${duration}ms)"
    else
        fail "TIMEOUT_5s_2retry" "delivery failed"
    fi

    sleep 1

    # Extended timeout with large message
    start=$(date +%s%N)
    if send "$TEST_AGENT" "TIMEOUT_extended: $(printf 'X%.0s' {1..500})" 10 3 >> "$LOG_FILE" 2>&1; then
        local end=$(date +%s%N)
        local duration=$(( (end - start) / 1000000 ))
        pass "TIMEOUT_10s_3retry (${duration}ms)"
    else
        fail "TIMEOUT_10s_3retry" "delivery failed"
    fi

    sleep 1
}

# ===== TEST SUITE 7: EDGE CASES =====
test_suite_edge() {
    separator
    log "TEST SUITE 7: Edge Cases"
    separator

    # Empty-ish message (just spaces)
    run_test "EDGE_spaces" "   "

    # Very long single word
    run_test "EDGE_longword" "$(printf 'a%.0s' {1..300})"

    # Message starting with special chars
    run_test "EDGE_start_special" "!@#\$%^&*() starts with special"

    # Message with only numbers
    run_test "EDGE_numbers" "1234567890123456789012345678901234567890"

    # JSON-like content
    run_test "EDGE_json" '{"key": "value", "array": [1, 2, 3]}'

    # URL
    run_test "EDGE_url" "Check https://example.com/path?query=value&other=123"

    # Code snippet
    run_test "EDGE_code" 'function test() { return "hello"; }'

    # Path with spaces
    run_test "EDGE_path_spaces" "/path/to/my file/with spaces.txt"

    # Markdown
    run_test "EDGE_markdown" "# Header\n**bold** and *italic*"

    sleep 1
}

# ===== TEST SUITE 8: BROADCAST FUNCTIONS =====
test_suite_broadcast() {
    separator
    log "TEST SUITE 8: Broadcast Functions"
    separator

    # Test all() function - sends to all agents
    log "Testing all() broadcast..."
    if all "BROADCAST_ALL: Test message to all agents" >> "$LOG_FILE" 2>&1; then
        pass "BROADCAST_all"
    else
        fail "BROADCAST_all" "broadcast returned error"
    fi

    sleep 2
}

# ===== GENERATE REPORT =====
generate_report() {
    separator
    log "GENERATING TEST REPORT"
    separator

    {
        echo "============================================"
        echo "TEAM-ALIASES.SH TEST REPORT"
        echo "Generated: $(date)"
        echo "Test Agent: $TEST_AGENT"
        echo "============================================"
        echo ""
        echo "SUMMARY"
        echo "-------"
        echo "Total Tests: $TOTAL_TESTS"
        echo "Passed: $PASSED"
        echo "Failed: $FAILED"
        echo "Warnings: $WARNINGS"
        echo "Pass Rate: $(( PASSED * 100 / TOTAL_TESTS ))%"
        echo ""
        echo "DETAILED RESULTS"
        echo "----------------"
        for test in "${!TEST_RESULTS[@]}"; do
            echo "$test: ${TEST_RESULTS[$test]}"
        done | sort
        echo ""
        echo "============================================"
    } | tee "$RESULTS_FILE"

    echo ""
    echo "Full log: $LOG_FILE"
    echo "Results: $RESULTS_FILE"
}

# ===== MAIN =====
main() {
    log "Starting team-aliases.sh test suite"
    log "Target agent: $TEST_AGENT"
    log "Log file: $LOG_FILE"

    # Verify target agent exists
    if ! _agent_exists "$TEST_AGENT"; then
        echo "ERROR: Agent '$TEST_AGENT' not found!"
        exit 1
    fi

    # Ensure capture is enabled
    enable_capture "$TEST_AGENT"

    # Run all test suites
    test_suite_sizes
    test_suite_characters
    test_suite_rapidfire
    test_suite_parallel
    test_suite_scroll
    test_suite_timeout
    test_suite_edge
    test_suite_broadcast

    generate_report

    # Exit with failure if any tests failed
    [ $FAILED -eq 0 ]
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
