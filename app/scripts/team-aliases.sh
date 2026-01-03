# Agent communication aliases (read-only, no spawn/kill/shutdown)
# Note: Use C-m instead of Enter - Enter creates newlines in Claude Code input
ana()  { tmux send-keys -t agent-ana -l "$*"; tmux send-keys -t agent-ana C-m; }
bill() { tmux send-keys -t agent-bill -l "$*"; tmux send-keys -t agent-bill C-m; }
carl() { tmux send-keys -t agent-carl -l "$*"; tmux send-keys -t agent-carl C-m; }
dan()  { tmux send-keys -t agent-dan -l "$*"; tmux send-keys -t agent-dan C-m; }
enzo() { tmux send-keys -t agent-enzo -l "$*"; tmux send-keys -t agent-enzo C-m; }
team() { ana "$*"; bill "$*"; carl "$*"; dan "$*"; enzo "$*"; }
