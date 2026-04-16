#!/usr/bin/env bash
# Install Intend git hooks
# Run once after cloning: bash scripts/install-hooks.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SCRIPTS_DIR="$REPO_ROOT/scripts"

echo "[install-hooks] Installing pre-commit hook…"
cp "$SCRIPTS_DIR/pre-commit" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
echo "[install-hooks] Done — pre-commit hook installed at $HOOKS_DIR/pre-commit"

# Verify gitleaks is available
if command -v gitleaks &>/dev/null; then
  echo "[install-hooks] gitleaks $(gitleaks version) found — full coverage active"
else
  echo ""
  echo "  WARNING: gitleaks not found."
  echo "  The hook will fall back to basic regex scanning."
  echo "  Install gitleaks for full coverage:"
  echo "    macOS:  brew install gitleaks"
  echo "    Linux:  https://github.com/gitleaks/gitleaks/releases"
  echo ""
fi
