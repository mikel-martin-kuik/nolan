#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

# CRITICAL: Validate Python version before install
python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)" || {
    echo "ERROR: Python 3.10+ required" >&2
    python3 --version >&2
    exit 1
}

# Use uv if available, fallback to pip
if command -v uv &> /dev/null; then
    echo "Installing with uv..."
    uv pip install -e .
else
    echo "uv not found, falling back to pip..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -e .
fi

echo "✓ Installation complete"
