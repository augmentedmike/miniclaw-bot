#!/usr/bin/env bash
##
# Install git hooks by symlinking from scripts/ into .git/hooks/.
#
# Usage:
#   bash scripts/install-hooks.sh
#   npm run hooks:install
##

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$ROOT/.git/hooks"
SCRIPTS_DIR="$ROOT/scripts"

echo "Installing git hooks..."

for hook in pre-commit prepare-commit-msg; do
  src="$SCRIPTS_DIR/$hook"
  dst="$HOOKS_DIR/$hook"

  if [ ! -f "$src" ]; then
    echo "  ⚠ $hook not found in scripts/, skipping"
    continue
  fi

  chmod +x "$src"

  # Back up existing hook if it's not already our symlink
  if [ -f "$dst" ] && [ ! -L "$dst" ]; then
    echo "  ⚠ Backing up existing $hook → $hook.bak"
    mv "$dst" "$dst.bak"
  fi

  ln -sf "$src" "$dst"
  echo "  ✓ $hook → scripts/$hook"
done

echo ""
echo "Hooks installed. Every commit will now:"
echo "  1. Run tests (fails commit if tests fail)"
echo "  2. Generate quality reports to reports/"
echo "  3. Stage reports/ and append metrics to commit message"
