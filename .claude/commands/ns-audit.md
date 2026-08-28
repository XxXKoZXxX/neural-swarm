---
description: Security audit Neural Swarm — checks for hardcoded secrets, insecure defaults, missing auth, RLS gaps, Stripe webhook issues.
argument-hint: "[optional: specific file or directory to audit]"
---

# Neural Swarm Security Audit

Run a targeted security audit on Neural Swarm codebase.

## Scope
$ARGUMENTS

If no scope provided, audit all recently changed files (`git diff HEAD~5 --name-only`).

## Audit Checklist

### 1. Secrets & Environment Variables
```bash
# Scan for hardcoded secrets
grep -r "sk_live\|sk_test\|supabase.*key\|anthropic.*key\|CLERK_SECRET" --include="*.ts" --include="*.js" --exclude-dir=node_modules .
grep -r "process\.env\." --include="*.ts" . | grep -v "NEXT_PUBLIC_"  # server vars must stay server-side
```

### 2. Auth Coverage
- Every `/api/*` route (except `/api/webhooks/*`) must call `auth()` and check `userId`
- Every `/dashboard/*` page must be behind Clerk middleware
- Scan for routes missing the auth check

### 3. Supabase RLS
- Identify tables without RLS enabled
- Check that user-scoped queries filter by `user_id = auth.uid()`
- Service role client must never be instantiated on client-side

### 4. Stripe Webhooks
- `stripe.webhooks.constructEvent()` must be called before processing any event
- Check for missing event type handling (subscription.deleted, payment_failed)
- Verify idempotency key usage on critical mutations

### 5. Anthropic API
- API key must only appear in server-side code
- Never log user prompts or agent outputs to console in production
- Check rate limiting / token limit enforcement per subscription tier

### 6. Agent Security
- Agent inputs sanitized before passing to Anthropic API
- No prompt injection vectors in user-controlled content
- System prompts don't leak internal instructions via user manipulation

## Output Format

```
CRITICAL: [issue] — [file:line] — [fix]
HIGH:     [issue] — [file:line] — [fix]  
MEDIUM:   [issue] — [file:line] — [fix]
PASS:     [check] ✓
```

Fix all CRITICAL and HIGH issues immediately. Report MEDIUM to user for decision.
