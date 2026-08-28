#!/bin/bash
# Neural Swarm — Pre-Write Secret Check
# Fires before any Write tool call. Checks content for hardcoded secrets.

# Read the file content from stdin (Claude Code passes tool input as JSON)
INPUT=$(cat)

CONTENT=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('content', data.get('new_string', '')))
" 2>/dev/null)

# Patterns to block
PATTERNS=(
  "sk_live_[a-zA-Z0-9]+"
  "sk_test_[a-zA-Z0-9]+"
  "anthropic.*['\"][a-zA-Z0-9-]{40,}"
  "supabase.*service.*[a-zA-Z0-9]{40,}"
  "CLERK_SECRET_KEY.*[a-zA-Z0-9_-]{30,}"
  "eyJhbGciOiJIUzI1NiJ9\."
)

for pattern in "${PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qE "$pattern" 2>/dev/null; then
    echo "BLOCKED: Hardcoded secret detected matching pattern: $pattern" >&2
    echo "Use process.env.VAR_NAME instead." >&2
    exit 1
  fi
done

exit 0
