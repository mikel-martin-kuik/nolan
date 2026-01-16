#!/bin/bash
# Fix tmux session sizes for Nolan agents
# Run this script to fix sessions that are stuck at small sizes (80x24)
# This typically happens after removing an embedded terminal implementation

echo "Fixing tmux session sizes..."
echo ""

for session in $(tmux list-sessions -F "#{session_name}" 2>/dev/null | grep "^agent-"); do
    echo "Session: $session"
    
    # Get current size
    current_size=$(tmux list-sessions -F "#{session_name}: #{window_width}x#{window_height}" 2>/dev/null | grep "^$session:")
    echo "  Before: $current_size"
    
    # Enable aggressive-resize
    tmux set-window-option -t "=$session" aggressive-resize on 2>/dev/null
    
    # Force resize to large size
    tmux resize-window -t "=$session" -x 200 -y 50 2>/dev/null
    
    # Set auto-size mode
    tmux resize-window -t "=$session" -A 2>/dev/null
    
    # Get new size (note: may not change until terminal resizes)
    new_size=$(tmux list-sessions -F "#{session_name}: #{window_width}x#{window_height}" 2>/dev/null | grep "^$session:")
    echo "  After:  $new_size"
    echo ""
done

echo "Done. If terminals are still small, try:"
echo "  1. Detach and reattach to each session"
echo "  2. Resize the terminal window"
echo "  3. Press Ctrl+L to refresh the display"
