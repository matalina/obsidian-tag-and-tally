#!/usr/bin/env bash
# Build and push the plugin to an Obsidian test vault, using the same
# DROPBOX_ROOT convention as the monorepo's sync-plugin-to-vault.sh.
#
# Usage: bash scripts/push-to-vault.sh [vault-name|absolute-path] [--skip-build]
#   vault-name (default: AppTesting) -> $DROPBOX_ROOT/Notebook/Writing/Tag and Tally/<vault>/.obsidian/plugins/tag-and-tally
#   absolute-path                    -> used as-is (must already include .../.obsidian/plugins/tag-and-tally or similar)
#   --skip-build                     -> trust the existing dist/ instead of rebuilding
#
# DROPBOX_ROOT is read from:
#   1. the DROPBOX_ROOT environment variable
#   2. ./.env (if present in this repo — gitignored)
#   3. ../tag-and-tally-prime/.env (sibling monorepo, auto-detected)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DIST="$ROOT/dist"
PLUGIN_ID="tag-and-tally"
VAULT_BASE="Notebook/Writing/Tag and Tally"

VAULT_ARG="AppTesting"
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -*)           echo "Unknown flag: $arg" >&2; exit 1 ;;
    *)            VAULT_ARG="$arg" ;;
  esac
done

# --- Resolve DROPBOX_ROOT ---
if [ -z "${DROPBOX_ROOT:-}" ] && [ -f "$ROOT/.env" ]; then
  set -a; . "$ROOT/.env"; set +a
fi
if [ -z "${DROPBOX_ROOT:-}" ] && [ -f "$ROOT/../tag-and-tally-prime/.env" ]; then
  set -a; . "$ROOT/../tag-and-tally-prime/.env"; set +a
fi

# --- Build (default) ---
if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "==> npm run build"
  npm run build
else
  echo "==> Skipping build (--skip-build)"
fi

if [ ! -d "$DIST" ] || [ -z "$(ls -A "$DIST" 2>/dev/null)" ]; then
  echo "Error: $DIST is missing or empty. Build first or omit --skip-build." >&2
  exit 1
fi

# --- Resolve destination ---
if [ "${VAULT_ARG#/}" = "$VAULT_ARG" ]; then
  # Vault name -> Dropbox path
  if [ -z "${DROPBOX_ROOT:-}" ]; then
    echo "Error: DROPBOX_ROOT not set (needed for vault name '$VAULT_ARG')." >&2
    echo "       Set DROPBOX_ROOT in the environment, or in this repo's .env, or in ../tag-and-tally-prime/.env." >&2
    exit 1
  fi
  DEST="${DROPBOX_ROOT}/${VAULT_BASE}/${VAULT_ARG}/.obsidian/plugins/${PLUGIN_ID}"
else
  DEST="$VAULT_ARG"
fi

# --- Sync ---
mkdir -p "$DEST"
if command -v rsync >/dev/null 2>&1; then
  rsync -av --delete "$DIST/" "$DEST/"
else
  rm -rf "${DEST:?}"/*
  cp -r "$DIST"/. "$DEST/"
fi

echo ""
echo "Pushed $PLUGIN_ID to $DEST"
echo "Reload Obsidian in vault '$VAULT_ARG' to pick up the new build."
