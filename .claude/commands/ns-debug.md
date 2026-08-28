---
description: Deep debugging session for Neural Swarm. Systematic root-cause analysis with evidence gathering.
argument-hint: "[describe the bug: what you expected, what happened, where]"
---

# Neural Swarm — Debug

Systematic root-cause debugging. No guessing.

## Bug Report
$ARGUMENTS

## Investigation Protocol

### Phase 1: Evidence Gathering (Do This First)
```bash
# Recent changes — bug often introduced here
git log --oneline -10
git diff HEAD~3 -- [affected area]

# Error logs
cat .next/trace 2>/dev/null | tail -50
# Check Vercel/browser console if frontend

# Type errors
npx tsc --noEmit 2>&1 | head -30
```

### Phase 2: Isolate the Layer

**Auth bug?**
- Check `auth()` call, middleware.ts matcher, Clerk dashboard for user
- Test with `console.log(auth())` at route entry

**DB bug?**
- Check Supabase logs: Dashboard → Logs → API
- Test RLS by running query as anon vs service role
- Verify `user_id` filter matches `auth.uid()`

**Stripe bug?**
- Check Stripe Dashboard → Webhooks → recent attempts
- Look for signature verification failures (raw body issue)
- Test locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

**Agent/SSE bug?**
- Check if stream closes prematurely (timeout? error swallowed?)
- Verify `Content-Type: text/event-stream` header set
- Test Anthropic API directly with `curl`

**Three.js bug?**
- Check for `.rotation.x = ` (use `.rotation.set()` instead)
- Verify OrbitControls not used (THREE r128 limitation)
- Check for `CapsuleGeometry` (use `CylinderGeometry` instead)

### Phase 3: Hypothesis Testing

State ONE hypothesis. Test it. If wrong, discard fully and form new hypothesis.
Do not apply fixes without confirming root cause.

### Phase 4: Fix + Verify

Apply minimal fix. Run:
```bash
npm run build  # must pass
# Test the specific failing scenario
```

Commit fix with message: `fix: [what was wrong] — [root cause]`

**Important:** Treat code you wrote with MORE skepticism than unfamiliar code. The bug is often where you're most confident.
