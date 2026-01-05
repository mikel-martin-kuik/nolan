#!/bin/bash
# Comprehensive QA Test Suite for team-aliases.sh
# Tests message delivery reliability under various conditions

set -o pipefail

# Source the aliases
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/team-aliases.sh"

# Test configuration
TEST_LOG="/tmp/team-aliases-test-$(date +%Y%m%d-%H%M%S).log"
PASS=0
FAIL=0
SKIP=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "$1" | tee -a "$TEST_LOG"
}

test_header() {
    log "\n${YELLOW}=== $1 ===${NC}"
}

test_result() {
    local name="$1"
    local result="$2"
    local details="$3"

    if [ "$result" -eq 0 ]; then
        log "${GREEN}[PASS]${NC} $name"
        ((PASS++))
    else
        log "${RED}[FAIL]${NC} $name - $details"
        ((FAIL++))
    fi
}

test_skip() {
    local name="$1"
    local reason="$2"
    log "${YELLOW}[SKIP]${NC} $name - $reason"
    ((SKIP++))
}

# Get a test target agent (prefer one that's not ralph to avoid self-messaging issues)
get_test_target() {
    local agents=$(_get_sessions '^agent-[a-z]+(-[0-9]+)?$')
    for session in $agents; do
        local name="${session#agent-}"
        # Skip ralph variants
        if [[ ! "$name" =~ ^ralph ]]; then
            echo "$name"
            return 0
        fi
    done
    # Fallback to first agent
    echo "$agents" | head -1 | sed 's/^agent-//'
}

# ===== TEST CATEGORIES =====

test_message_sizes() {
    test_header "MESSAGE SIZE TESTS"
    local target=$(get_test_target)

    if [ -z "$target" ]; then
        test_skip "Size tests" "No target agent available"
        return
    fi

    # Small message (< 50 chars)
    local small_msg="Test small msg"
    if send "$target" "$small_msg" 3 1 >/dev/null 2>&1; then
        test_result "Small message (${#small_msg} chars)" 0
    else
        test_result "Small message (${#small_msg} chars)" 1 "Delivery failed"
    fi
    sleep 0.5

    # Medium message (~100 chars)
    local medium_msg="This is a medium-sized test message that contains approximately one hundred characters for testing purposes."
    if send "$target" "$medium_msg" 5 1 >/dev/null 2>&1; then
        test_result "Medium message (${#medium_msg} chars)" 0
    else
        test_result "Medium message (${#medium_msg} chars)" 1 "Delivery failed"
    fi
    sleep 0.5

    # Large message (~500 chars)
    local large_msg="This is a large test message designed to test the messaging system's ability to handle longer content. It includes multiple sentences to simulate a more realistic message that an agent might send during normal operations. The message system should be able to handle this without truncation or corruption. This tests the bracketed paste mode and the tmux send-keys literal mode for preserving message integrity."
    if send "$target" "$large_msg" 8 2 >/dev/null 2>&1; then
        test_result "Large message (${#large_msg} chars)" 0
    else
        test_result "Large message (${#large_msg} chars)" 1 "Delivery failed"
    fi
    sleep 0.5

    # Very large message (~2000 chars)
    local huge_msg=$(printf 'A%.0s' {1..2000})
    if send "$target" "$huge_msg" 10 2 >/dev/null 2>&1; then
        test_result "Huge message (${#huge_msg} chars)" 0
    else
        test_result "Huge message (${#huge_msg} chars)" 1 "Delivery failed or timeout"
    fi
    sleep 1
}

test_special_characters() {
    test_header "SPECIAL CHARACTER TESTS"
    local target=$(get_test_target)

    if [ -z "$target" ]; then
        test_skip "Special char tests" "No target agent available"
        return
    fi

    # Single quotes
    local sq_msg="Test with 'single quotes' inside"
    if send "$target" "$sq_msg" 5 1 >/dev/null 2>&1; then
        test_result "Single quotes" 0
    else
        test_result "Single quotes" 1 "Delivery failed"
    fi
    sleep 0.3

    # Double quotes
    local dq_msg='Test with "double quotes" inside'
    if send "$target" "$dq_msg" 5 1 >/dev/null 2>&1; then
        test_result "Double quotes" 0
    else
        test_result "Double quotes" 1 "Delivery failed"
    fi
    sleep 0.3

    # Backticks
    local bt_msg='Test with `backticks` inside'
    if send "$target" "$bt_msg" 5 1 >/dev/null 2>&1; then
        test_result "Backticks" 0
    else
        test_result "Backticks" 1 "Delivery failed"
    fi
    sleep 0.3

    # Dollar signs (variable expansion risk)
    local ds_msg='Test with $VARIABLE and ${EXPANSION}'
    if send "$target" "$ds_msg" 5 1 >/dev/null 2>&1; then
        test_result "Dollar signs" 0
    else
        test_result "Dollar signs" 1 "Delivery failed"
    fi
    sleep 0.3

    # Backslashes
    local bs_msg='Test with \\backslashes\\ and \\n escapes'
    if send "$target" "$bs_msg" 5 1 >/dev/null 2>&1; then
        test_result "Backslashes" 0
    else
        test_result "Backslashes" 1 "Delivery failed"
    fi
    sleep 0.3

    # Unicode characters
    local uni_msg="Test with unicode: 日本語 emoji: 🚀🎉 symbols: ★☆♠♥"
    if send "$target" "$uni_msg" 5 1 >/dev/null 2>&1; then
        test_result "Unicode characters" 0
    else
        test_result "Unicode characters" 1 "Delivery failed"
    fi
    sleep 0.3

    # Special shell chars
    local shell_msg='Test with shell chars: & | ; > < * ? [ ] { } ( ) ! # ~'
    if send "$target" "$shell_msg" 5 1 >/dev/null 2>&1; then
        test_result "Shell metacharacters" 0
    else
        test_result "Shell metacharacters" 1 "Delivery failed"
    fi
    sleep 0.3

    # Newlines (should be handled by bracketed paste)
    local nl_msg=$'Line 1\nLine 2\nLine 3'
    if send "$target" "$nl_msg" 5 1 >/dev/null 2>&1; then
        test_result "Embedded newlines" 0
    else
        test_result "Embedded newlines" 1 "Delivery failed"
    fi
    sleep 0.3

    # Tab characters
    local tab_msg=$'Column1\tColumn2\tColumn3'
    if send "$target" "$tab_msg" 5 1 >/dev/null 2>&1; then
        test_result "Tab characters" 0
    else
        test_result "Tab characters" 1 "Delivery failed"
    fi
    sleep 0.3

    # Mixed dangerous combo
    local danger_msg='$(whoami) && rm -rf / ; echo "pwned" | `cat /etc/passwd` > /dev/null'
    if send "$target" "$danger_msg" 5 1 >/dev/null 2>&1; then
        test_result "Injection-style string" 0
    else
        test_result "Injection-style string" 1 "Delivery failed"
    fi
}

test_rapid_fire() {
    test_header "RAPID-FIRE TESTS"
    local target=$(get_test_target)

    if [ -z "$target" ]; then
        test_skip "Rapid-fire tests" "No target agent available"
        return
    fi

    # Send 5 messages rapidly
    local rapid_success=0
    local rapid_fail=0

    log "Sending 5 rapid messages..."
    for i in {1..5}; do
        if send "$target" "Rapid message $i of 5" 3 0 >/dev/null 2>&1; then
            ((rapid_success++))
        else
            ((rapid_fail++))
        fi
        # Minimal delay between sends
        sleep 0.1
    done

    if [ $rapid_fail -eq 0 ]; then
        test_result "Rapid-fire 5 messages" 0
    else
        test_result "Rapid-fire 5 messages" 1 "$rapid_success/5 delivered, $rapid_fail failed"
    fi
    sleep 1

    # Send 10 messages with no delay
    rapid_success=0
    rapid_fail=0

    log "Sending 10 no-delay messages..."
    for i in {1..10}; do
        if send "$target" "Burst message $i" 2 0 >/dev/null 2>&1; then
            ((rapid_success++))
        else
            ((rapid_fail++))
        fi
    done

    local rate=$((rapid_success * 100 / 10))
    if [ $rate -ge 80 ]; then
        test_result "Burst 10 messages (${rate}% delivered)" 0
    elif [ $rate -ge 50 ]; then
        log "${YELLOW}[WARN]${NC} Burst 10 messages - ${rate}% delivery rate"
        ((PASS++))  # Partial pass
    else
        test_result "Burst 10 messages" 1 "Only ${rate}% delivered"
    fi
}

test_parallel_messages() {
    test_header "PARALLEL MESSAGE TESTS"

    local agents=$(_get_sessions '^agent-[a-z]+$')
    local agent_count=$(echo "$agents" | wc -l)

    if [ "$agent_count" -lt 2 ]; then
        test_skip "Parallel tests" "Need at least 2 agents"
        return
    fi

    # Get first 3 non-ralph agents
    local targets=()
    for session in $agents; do
        local name="${session#agent-}"
        if [[ ! "$name" =~ ^ralph ]]; then
            targets+=("$name")
            [ ${#targets[@]} -ge 3 ] && break
        fi
    done

    if [ ${#targets[@]} -lt 2 ]; then
        test_skip "Parallel tests" "Not enough non-ralph agents"
        return
    fi

    # Send to multiple agents in parallel
    local para_success=0
    local para_fail=0

    log "Sending parallel messages to ${#targets[@]} agents..."
    local pids=()

    for target in "${targets[@]}"; do
        (send "$target" "Parallel test to $target" 5 1 >/dev/null 2>&1) &
        pids+=($!)
    done

    # Wait and collect results
    for pid in "${pids[@]}"; do
        if wait $pid; then
            ((para_success++))
        else
            ((para_fail++))
        fi
    done

    if [ $para_fail -eq 0 ]; then
        test_result "Parallel to ${#targets[@]} agents" 0
    else
        test_result "Parallel to ${#targets[@]} agents" 1 "$para_success/${#targets[@]} delivered"
    fi
}

test_copy_mode_handling() {
    test_header "COPY-MODE/SCROLL TESTS"
    local target=$(get_test_target)

    if [ -z "$target" ]; then
        test_skip "Copy-mode tests" "No target agent available"
        return
    fi

    local session="agent-$target"

    # Put target into copy mode
    log "Putting $target into copy mode..."
    tmux send-keys -t "$session" C-b [  # Enter copy mode
    sleep 0.2

    # Scroll up a bit
    tmux send-keys -t "$session" C-u
    sleep 0.2

    # Try to send message (should exit copy mode first)
    if send "$target" "Message while in copy mode" 8 2 >/dev/null 2>&1; then
        test_result "Send while target in copy mode" 0
    else
        test_result "Send while target in copy mode" 1 "Delivery failed"
    fi

    # Verify copy mode was exited
    local in_mode=$(tmux display-message -t "$session" -p '#{pane_in_mode}' 2>/dev/null)
    if [ "$in_mode" = "0" ]; then
        test_result "Copy mode auto-exit" 0
    else
        test_result "Copy mode auto-exit" 1 "Still in copy mode"
        # Clean up - exit copy mode
        tmux send-keys -t "$session" q
    fi
}

test_broadcast_functions() {
    test_header "BROADCAST FUNCTION TESTS"

    local agents=$(_get_sessions '^agent-[a-z]+$')
    local agent_count=$(echo "$agents" | wc -l)

    if [ "$agent_count" -lt 2 ]; then
        test_skip "Broadcast tests" "Need at least 2 agents"
        return
    fi

    # Test team broadcast (core agents only)
    log "Testing team broadcast..."
    local team_output=$(team "Broadcast test $(date +%s)" 2>&1)

    if echo "$team_output" | grep -q "0 failed"; then
        test_result "Team broadcast" 0
    else
        local delivered=$(echo "$team_output" | grep -oP '\d+ delivered' | grep -oP '\d+')
        local failed=$(echo "$team_output" | grep -oP '\d+ failed' | grep -oP '\d+')
        test_result "Team broadcast" 1 "$delivered delivered, $failed failed"
    fi

    sleep 1

    # Test all broadcast
    log "Testing all agents broadcast..."
    local all_output=$(all "All broadcast test $(date +%s)" 2>&1)

    if echo "$all_output" | grep -q "0 failed"; then
        test_result "All agents broadcast" 0
    else
        local delivered=$(echo "$all_output" | grep -oP '\d+ delivered' | grep -oP '\d+')
        local failed=$(echo "$all_output" | grep -oP '\d+ failed' | grep -oP '\d+')
        test_result "All agents broadcast" 1 "$delivered delivered, $failed failed"
    fi
}

test_timeout_retry() {
    test_header "TIMEOUT AND RETRY TESTS"
    local target=$(get_test_target)

    if [ -z "$target" ]; then
        test_skip "Timeout tests" "No target agent available"
        return
    fi

    # Test with very short timeout (should still work for simple messages)
    log "Testing with 1-second timeout..."
    if send "$target" "Short timeout test" 1 0 >/dev/null 2>&1; then
        test_result "1-second timeout" 0
    else
        test_result "1-second timeout" 1 "Message delivery failed"
    fi

    sleep 0.5

    # Test retry mechanism
    log "Testing retry mechanism..."
    if send "$target" "Retry mechanism test" 2 3 >/dev/null 2>&1; then
        test_result "Retry mechanism (3 retries)" 0
    else
        test_result "Retry mechanism (3 retries)" 1 "Failed after retries"
    fi
}

test_utility_functions() {
    test_header "UTILITY FUNCTION TESTS"
    local target=$(get_test_target)

    # Test list_agents
    local agents_output=$(list_agents 2>&1)
    if echo "$agents_output" | grep -q "Active Agents"; then
        test_result "list_agents function" 0
    else
        test_result "list_agents function" 1 "Unexpected output"
    fi

    # Test _agent_exists
    if _agent_exists "$(echo "$target" | head -1)"; then
        test_result "_agent_exists (valid agent)" 0
    else
        test_result "_agent_exists (valid agent)" 1 "Failed to detect existing agent"
    fi

    if _agent_exists "nonexistent-agent-xyz"; then
        test_result "_agent_exists (invalid agent)" 1 "False positive"
    else
        test_result "_agent_exists (invalid agent)" 0
    fi

    # Test logpath
    local logpath_output=$(logpath "$target" 2>&1)
    if [[ "$logpath_output" == *".out"* ]]; then
        test_result "logpath function" 0
    else
        test_result "logpath function" 1 "Invalid path returned"
    fi

    # Test show function
    local show_output=$(show "$target" 5 2>&1)
    if [[ "$show_output" == *"output"* ]] || [[ "$show_output" == *"pane"* ]]; then
        test_result "show function" 0
    else
        test_result "show function" 1 "Unexpected output"
    fi
}

test_edge_cases() {
    test_header "EDGE CASE TESTS"

    # Send to non-existent agent
    local invalid_output=$(send "nonexistent-agent-xyz123" "Test message" 1 0 2>&1)
    if echo "$invalid_output" | grep -q "not found"; then
        test_result "Send to non-existent agent" 0
    else
        test_result "Send to non-existent agent" 1 "Did not report agent not found"
    fi

    # Empty message
    local target=$(get_test_target)
    if [ -n "$target" ]; then
        if send "$target" "" 3 0 >/dev/null 2>&1; then
            test_result "Empty message" 0  # Should succeed (just sends msg ID)
        else
            test_result "Empty message" 1 "Failed"
        fi
    fi

    # Very long single word (no spaces)
    local longword=$(printf 'x%.0s' {1..500})
    if send "$target" "$longword" 5 1 >/dev/null 2>&1; then
        test_result "500-char single word" 0
    else
        test_result "500-char single word" 1 "Delivery failed"
    fi
}

# ===== MAIN =====

main() {
    log "======================================"
    log "TEAM-ALIASES.SH TEST SUITE"
    log "Started: $(date)"
    log "Test log: $TEST_LOG"
    log "======================================"

    # Check prerequisites
    if ! command -v tmux &>/dev/null; then
        log "${RED}ERROR: tmux not found${NC}"
        exit 1
    fi

    local agents=$(_get_sessions)
    if [ -z "$agents" ]; then
        log "${RED}ERROR: No agents running${NC}"
        exit 1
    fi

    log "Found agents: $(echo "$agents" | tr '\n' ' ')"
    log "Test target: $(get_test_target)"

    # Run all test categories
    test_utility_functions
    test_message_sizes
    test_special_characters
    test_rapid_fire
    test_parallel_messages
    test_copy_mode_handling
    test_broadcast_functions
    test_timeout_retry
    test_edge_cases

    # Summary
    log "\n======================================"
    log "TEST SUMMARY"
    log "======================================"
    log "${GREEN}PASSED: $PASS${NC}"
    log "${RED}FAILED: $FAIL${NC}"
    log "${YELLOW}SKIPPED: $SKIP${NC}"
    log "Total: $((PASS + FAIL + SKIP))"
    log "Log saved to: $TEST_LOG"

    local pass_rate=$((PASS * 100 / (PASS + FAIL + 1)))
    if [ $FAIL -eq 0 ]; then
        log "\n${GREEN}ALL TESTS PASSED!${NC}"
        return 0
    elif [ $pass_rate -ge 80 ]; then
        log "\n${YELLOW}MOSTLY PASSED (${pass_rate}%)${NC}"
        return 0
    else
        log "\n${RED}TEST SUITE FAILED (${pass_rate}% pass rate)${NC}"
        return 1
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
