#!/bin/bash
# Deploy dist/ to gh-pages branch (clean, no node_modules)
# Uses temp directory to avoid branch-switching issues
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

# Ensure local binaries are in PATH (don't override system PATH which may break arch detection)
export PATH="$(pwd)/node_modules/.bin:$PATH"

# Step 1: Build on main branch
echo "Building..."
pnpm build

# Step 2: Copy dist to a temp directory (safe from branch switching)
TMPDIR=$(mktemp -d)
echo "Using temp dir: $TMPDIR"
cp -r dist/* "$TMPDIR/"
touch "$TMPDIR/.nojekyll"
echo "Copied $(find "$TMPDIR" -type f | wc -l) files to temp"

# Step 3: Switch to gh-pages and clean
CURRENT_BRANCH=$(git branch --show-current)
# Stash any uncommitted changes to avoid checkout failure
NEED_STASH=0
if [ -n "$(git status --porcelain)" ]; then
  echo "Stashing uncommitted changes..."
  git stash push -u -m "deploy: auto-stash before gh-pages switch"
  NEED_STASH=1
fi
git checkout gh-pages

# Remove everything except .git (use -not instead of ! for zsh compatibility)
find . -maxdepth 1 -not -name '.git' -not -name '.' -exec rm -rf {} +

# Step 4: Copy from temp (includes .nojekyll via the "." copy)
cp -r "$TMPDIR/." .
rm -rf "$TMPDIR"

# Step 5: Double-check .nojekyll exists (critical for GitHub Pages)
if [ ! -f .nojekyll ]; then
  echo "Warning: .nojekyll missing, creating it..."
  touch .nojekyll
fi

echo "Deployed files:"
echo "  .nojekyll: $(test -f .nojekyll && echo 'YES' || echo 'NO')"
echo "  node_modules: $(test -d node_modules && echo 'YES (BAD)' || echo 'NO (GOOD)')"
echo "  Total files: $(find . -not -path './.git/*' -not -path './.git' | wc -l)"

# Step 6: Commit and push
git add -A
git commit -m "deploy: $(date +%Y-%m-%d)" || echo "No changes to deploy"
git push origin gh-pages

# Step 7: Go back to original branch
git checkout "$CURRENT_BRANCH"

# Step 8: Restore stashed changes if we stashed them
if [ "$NEED_STASH" = "1" ]; then
  echo "Restoring stashed changes..."
  git stash pop
fi

# Step 9: Restore node_modules if needed (branch switch may have deleted it)
if [ ! -d node_modules ]; then
  echo "Restoring node_modules..."
  pnpm install
fi

echo "Deployed to gh-pages!"
