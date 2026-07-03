#!/bin/bash
# Neural Swarm — Session Stop Summary
# Prints a quick summary of what changed this session

echo ""
echo "═══════════════════════════════════════"
echo "  NEURAL SWARM — SESSION COMPLETE"
echo "═══════════════════════════════════════"

# Files changed
CHANGED=$(git diff HEAD --name-only 2>/dev/null | wc -l | tr -d ' ')
echo "  Files modified: $CHANGED"

if [ "$CHANGED" -gt 0 ]; then
  git diff HEAD --name-only 2>/dev/null | sed 's/^/  · /'
fi

# Uncommitted changes warning
UNSTAGED=$(git status --porcelain 2>/dev/null | grep -c "^[^?]" || true)
if [ "$UNSTAGED" -gt 0 ]; then
  echo ""
  echo "  ⚠️  $UNSTAGED uncommitted change(s) — run /ns-commit"
fi

# Build status reminder
echo ""
echo "  Run before shipping: npm run build"
echo "  Security check: /ns-audit"
echo "═══════════════════════════════════════"
echo ""

exit 0
