#!/bin/bash
# Neural Swarm — Post-Write TypeScript Check
# After writing .ts/.tsx files, run a fast type check on the changed file

INPUT=$(cat)
FILE=$(echo "$INPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('path', data.get('file_path', '')))
" 2>/dev/null)

# Only check TypeScript files
if [[ "$FILE" != *.ts && "$FILE" != *.tsx ]]; then
  exit 0
fi

# Skip node_modules, .next
if [[ "$FILE" == *node_modules* || "$FILE" == *.next* ]]; then
  exit 0
fi

# Quick type check on just this file (fast)
if command -v npx &>/dev/null; then
  cd "$(dirname "$FILE")" 2>/dev/null || exit 0
  # Find project root (has tsconfig.json)
  root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
  if [ -f "$root/tsconfig.json" ]; then
    ERRORS=$(cd "$root" && npx tsc --noEmit --skipLibCheck 2>&1 | grep -c "error TS" || true)
    if [ "$ERRORS" -gt 0 ]; then
      echo "⚠️  TypeScript: $ERRORS error(s) after writing $FILE"
      cd "$root" && npx tsc --noEmit --skipLibCheck 2>&1 | grep "error TS" | head -5
      # Don't block — just warn
    fi
  fi
fi

exit 0
