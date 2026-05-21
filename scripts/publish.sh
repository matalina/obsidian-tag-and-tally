#!/usr/bin/env bash
# Publish an Obsidian community plugin release from this repo.
#
# Expected workflow:
#   1. The monorepo's deploy-all (or deploy-plugin) has synced the latest
#      plugin source + vendored deps + bumped manifest.json/versions.json
#      into this repo, leaving an uncommitted diff.
#   2. You ran `npm install` (first time only) and `npm run push` to
#      smoke-test the build in a real vault.
#   3. You're happy with the build. Run this script to commit the synced
#      diff, tag, and push. The release itself is built and published by
#      the .github/workflows/release.yml workflow, which also attaches
#      build-provenance attestations to main.js, manifest.json, and styles.css.
#
# Usage: bash scripts/publish.sh [--dry-run]
#   --dry-run  Print what would happen; don't commit, tag, or push.
#
# Requires: gh CLI installed and authenticated (`gh auth login`).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] $*"
  else
    eval "$@"
  fi
}

# --- Preconditions ---
command -v gh >/dev/null 2>&1 || { echo "Error: gh CLI not installed. https://cli.github.com/" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Error: gh CLI not authenticated. Run 'gh auth login'." >&2; exit 1; }

BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "Error: must be on branch 'main' (current: $BRANCH)." >&2
  exit 1
fi

VERSION=$(node -p "JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version")
if [ -z "$VERSION" ] || [ "$VERSION" = "undefined" ]; then
  echo "Error: could not read version from manifest.json" >&2
  exit 1
fi

echo "==> Publishing tag-and-tally $VERSION"

# Refuse to overwrite an existing tag — Obsidian users would silently get a
# different plugin under the same release; force-pushing tags is the wrong
# fix. If the tag already exists, bump the version in the monorepo and re-sync.
if git rev-parse "refs/tags/$VERSION" >/dev/null 2>&1; then
  echo "Error: local tag '$VERSION' already exists. Bump the version in the monorepo and re-sync." >&2
  exit 1
fi
if git ls-remote --exit-code --tags origin "refs/tags/$VERSION" >/dev/null 2>&1; then
  echo "Error: remote tag '$VERSION' already exists on origin. Bump the version in the monorepo and re-sync." >&2
  exit 1
fi

# --- Commit pending sync diff (if any) ---
if [ -n "$(git status --porcelain)" ]; then
  echo "==> Committing synced changes"
  run "git add -A"
  run "git commit -m 'release: $VERSION'"
else
  echo "==> No pending changes to commit"
fi

# --- Tag, push ---
echo "==> Tagging $VERSION (no 'v' prefix per Obsidian guidelines)"
run "git tag '$VERSION'"

echo "==> Pushing main + tag to origin"
run "git push origin main"
run "git push origin 'refs/tags/$VERSION'"

if [ "$DRY_RUN" -eq 0 ]; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
  echo ""
  echo "==> Tag pushed. The release workflow will build, attest, and publish:"
  echo "    https://github.com/$REPO/actions"
  echo ""
  echo "Once it finishes:"
  echo "    https://github.com/$REPO/releases/tag/$VERSION"
  echo ""
  echo "If this is your first release, the next step is the one-time PR to the"
  echo "Obsidian community plugin list:"
  echo "  https://github.com/obsidianmd/obsidian-releases/edit/HEAD/community-plugins.json"
else
  echo ""
  echo "[dry-run] No changes made. Re-run without --dry-run to publish."
fi
