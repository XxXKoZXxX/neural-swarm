#!/bin/bash
# Neural Swarm — Pre-Bash Safety Check
# Blocks destructive commands without explicit confirmation pattern

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('command', ''))
" 2>/dev/null)

# Block patterns
BLOCKED=(
  "DROP TABLE"
  "DROP DATABASE"
  "DELETE FROM.*WHERE.*1=1"
  "rm -rf /"
  "rm -rf ~"
  "> /dev/sda"
  "stripe.* delete"
  "supabase db reset --linked"
)

for pattern in "${BLOCKED[@]}"; do
  if echo "$CMD" | grep -qi "$pattern" 2>/dev/null; then
    echo "BLOCKED: Potentially destructive command detected: $pattern" >&2
    echo "Command: $CMD" >&2
    exit 1
  fi
done

exit 0
