#!/usr/bin/env bash
set -euo pipefail

# ── Miniclaw Installer ──────────────────────────────────────────────
# Usage:
#   ./install.sh              → ~/.miniclaw     (prod)
#   ./install.sh --dev        → ~/.miniclaw-dev (dev)
#   ./install.sh --dir /path  → custom location

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR=""

# ── Parse args ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev)    INSTALL_DIR="$HOME/.miniclaw-dev"; shift ;;
    --dir)    INSTALL_DIR="$2"; shift 2 ;;
    *)        echo "Unknown option: $1"; exit 1 ;;
  esac
done

INSTALL_DIR="${INSTALL_DIR:-$HOME/.miniclaw}"

# ── Prerequisites ────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "Error: node is not installed or not on PATH"
  exit 1
fi

NODE_MAJOR="$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Error: node >= 18 required (found v$NODE_MAJOR)"
  exit 1
fi

if [[ ! -d "$SCRIPT_DIR/dist" ]]; then
  echo "Error: dist/ not found. Run 'npm run build' first."
  exit 1
fi

# ── Create directory structure ───────────────────────────────────────
echo "Installing to $INSTALL_DIR"

# System dirs (we own these — safe to overwrite on update)
mkdir -p "$INSTALL_DIR"/system/{bin,lib,templates,instructions}

# User dirs (agent/user owns — never overwritten)
mkdir -p "$INSTALL_DIR"/user/{personas,snapshots}

echo "  directory structure created"

# ── Copy bundles to system/lib (always overwritten) ──────────────────
cp "$SCRIPT_DIR/dist/miniclaw.mjs"      "$INSTALL_DIR/system/lib/miniclaw.mjs"
cp "$SCRIPT_DIR/dist/vault-cli.mjs"     "$INSTALL_DIR/system/lib/vault-cli.mjs"
cp "$SCRIPT_DIR/dist/persona-cli.mjs"   "$INSTALL_DIR/system/lib/persona-cli.mjs"
cp "$SCRIPT_DIR/dist/snapshot-cli.mjs"  "$INSTALL_DIR/system/lib/snapshot-cli.mjs"
cp "$SCRIPT_DIR/dist/install-tui.mjs"  "$INSTALL_DIR/system/lib/install-tui.mjs"
cp "$SCRIPT_DIR/dist/kanban-cli.mjs"   "$INSTALL_DIR/system/lib/kanban-cli.mjs"
cp "$SCRIPT_DIR/dist/kb-cli.mjs"      "$INSTALL_DIR/system/lib/kb-cli.mjs"
cp "$SCRIPT_DIR/dist/service-cli.mjs" "$INSTALL_DIR/system/lib/service-cli.mjs"
cp "$SCRIPT_DIR/dist/dispatch-cli.mjs" "$INSTALL_DIR/system/lib/dispatch-cli.mjs"

# Copy sourcemaps if they exist
cp "$SCRIPT_DIR/dist/miniclaw.mjs.map"      "$INSTALL_DIR/system/lib/miniclaw.mjs.map"      2>/dev/null || true
cp "$SCRIPT_DIR/dist/vault-cli.mjs.map"     "$INSTALL_DIR/system/lib/vault-cli.mjs.map"     2>/dev/null || true
cp "$SCRIPT_DIR/dist/persona-cli.mjs.map"   "$INSTALL_DIR/system/lib/persona-cli.mjs.map"   2>/dev/null || true
cp "$SCRIPT_DIR/dist/snapshot-cli.mjs.map"  "$INSTALL_DIR/system/lib/snapshot-cli.mjs.map"  2>/dev/null || true
cp "$SCRIPT_DIR/dist/install-tui.mjs.map"  "$INSTALL_DIR/system/lib/install-tui.mjs.map"  2>/dev/null || true
cp "$SCRIPT_DIR/dist/kanban-cli.mjs.map"   "$INSTALL_DIR/system/lib/kanban-cli.mjs.map"   2>/dev/null || true
cp "$SCRIPT_DIR/dist/kb-cli.mjs.map"      "$INSTALL_DIR/system/lib/kb-cli.mjs.map"      2>/dev/null || true
cp "$SCRIPT_DIR/dist/service-cli.mjs.map" "$INSTALL_DIR/system/lib/service-cli.mjs.map" 2>/dev/null || true
cp "$SCRIPT_DIR/dist/dispatch-cli.mjs.map" "$INSTALL_DIR/system/lib/dispatch-cli.mjs.map" 2>/dev/null || true

# Symlink node_modules so native add-ons (better-sqlite3, sqlite-vec, etc.)
# are resolvable from the installed bundles via createRequire(import.meta.url).
ln -sfn "$SCRIPT_DIR/node_modules" "$INSTALL_DIR/system/lib/node_modules"

echo "  system/lib/ updated"

# ── Copy templates to system/templates (always overwritten) ──────────
cp "$SCRIPT_DIR/templates/persona.md" "$INSTALL_DIR/system/templates/persona.md"

# Legacy templates (soul.md, ethics.md) also go to system
if [[ -f "$SCRIPT_DIR/templates/soul.md" ]]; then
  cp "$SCRIPT_DIR/templates/soul.md" "$INSTALL_DIR/system/templates/soul.md"
fi
if [[ -f "$SCRIPT_DIR/templates/ethics.md" ]]; then
  cp "$SCRIPT_DIR/templates/ethics.md" "$INSTALL_DIR/system/templates/ethics.md"
fi

echo "  system/templates/ updated"

# ── Copy CLI instructions to system/instructions (always overwritten) ─
for f in "$SCRIPT_DIR"/instructions/*.md; do
  [[ -f "$f" ]] && cp "$f" "$INSTALL_DIR/system/instructions/$(basename "$f")"
done

echo "  system/instructions/ updated"

# ── Write bin wrappers to system/bin (always overwritten) ────────────
write_wrapper() {
  local name="$1"
  local lib="$2"
  cat > "$INSTALL_DIR/system/bin/$name" << WRAPPER
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="\$(cd "\$(dirname "\$(readlink -f "\$0" 2>/dev/null || realpath "\$0" 2>/dev/null || echo "\$0")")" && pwd)"
export MINICLAW_HOME="\$(cd "\$SCRIPT_DIR/../.." && pwd)"
exec node "\$MINICLAW_HOME/system/lib/$lib" "\$@"
WRAPPER
  chmod +x "$INSTALL_DIR/system/bin/$name"
}

write_wrapper "miniclaw"          "miniclaw.mjs"
write_wrapper "miniclaw-vault"    "vault-cli.mjs"
write_wrapper "miniclaw-persona"  "persona-cli.mjs"
write_wrapper "miniclaw-snapshot" "snapshot-cli.mjs"
write_wrapper "miniclaw-kanban"   "kanban-cli.mjs"
write_wrapper "miniclaw-kb"      "kb-cli.mjs"
write_wrapper "miniclaw-service"  "service-cli.mjs"
write_wrapper "miniclaw-dispatch" "dispatch-cli.mjs"

echo "  system/bin/ updated"

# ── Interactive persona setup ─────────────────────────────────────────
# The TUI handles: persona creation, legacy file import, vault init.
# Skips automatically on re-install (personas already exist) or non-TTY.
echo ""
export MINICLAW_HOME="$INSTALL_DIR"
node "$INSTALL_DIR/system/lib/install-tui.mjs" || true

# ── Install service daemon ──────────────────────────────────────────
echo ""
echo "Installing service daemon..."
node "$INSTALL_DIR/system/lib/service-cli.mjs" install || echo "  Service install skipped — run 'miniclaw-service install' manually"

# ── Install dispatch cron ──────────────────────────────────────────
echo ""
echo "Installing dispatch timer..."
node "$INSTALL_DIR/system/lib/dispatch-cli.mjs" install || echo "  Dispatch cron skipped — run 'miniclaw-dispatch install' manually"

# ── PATH setup ───────────────────────────────────────────────────────
BIN_DIR="$INSTALL_DIR/system/bin"

path_already_set() {
  echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"
}

if path_already_set; then
  echo ""
  echo "PATH already includes $BIN_DIR"
else
  echo ""
  echo "To use miniclaw from anywhere, add to your shell profile:"
  echo ""

  EXPORT_LINE="export PATH=\"$BIN_DIR:\$PATH\""

  # Detect shell config file
  SHELL_NAME="$(basename "${SHELL:-bash}")"
  case "$SHELL_NAME" in
    zsh)  RC_FILE="$HOME/.zshrc" ;;
    bash) RC_FILE="$HOME/.bashrc" ;;
    fish) RC_FILE="$HOME/.config/fish/config.fish" ;;
    *)    RC_FILE="" ;;
  esac

  if [[ "$SHELL_NAME" == "fish" ]]; then
    EXPORT_LINE="set -gx PATH $BIN_DIR \$PATH"
  fi

  echo "  $EXPORT_LINE"
  echo ""

  if [[ -n "$RC_FILE" ]] && [[ -t 0 ]]; then
    read -rp "Add to $RC_FILE? [y/N] " answer
    if [[ "$answer" =~ ^[Yy]$ ]]; then
      echo "" >> "$RC_FILE"
      echo "# Miniclaw" >> "$RC_FILE"
      echo "$EXPORT_LINE" >> "$RC_FILE"
      echo "Added to $RC_FILE — restart your shell or run: source $RC_FILE"
    fi
  fi
fi

echo ""
echo "Done. Run 'miniclaw --help' to get started."
