# Neural Swarm — Claude Code Instructions

## Project Identity

**Neural Swarm** is a multi-agent AI orchestration SaaS platform with a corporate noir aesthetic (GTA V × The Firm 1993). Solo founder product. Ship fast, charge early, ugly-but-functional > polished-but-useless.

**Stack:** Next.js 14+ (App Router) · TypeScript · Clerk (auth) · Supabase (Postgres + RLS) · Stripe (billing) · Anthropic API (real LLM streaming via SSE) · Three.js (3D UI) · Tailwind

**Live features:** Prompt Forge · Interrogate Node · Render Blueprint · Audio Log (TTS) · The Vault · OpenClaw Execution Audit

**Aesthetic:** mahogany/gold/venetian blinds · corporate noir · neon amber terminals · real agents doing real work — no fake state machines

---

## Working Rules

**Solo dev. No team. No budget. Time is the constraint.**

- Ship > perfect. Validate with real users paying $10/month before polishing
- Auth, DB, Stripe, limits = always functional. UI = flexible
- Always use real Anthropic API calls — never simulate agent behavior
- SSE streaming: use `ReadableStream` + `TransformStream`, never buffer full responses
- Three.js: use `.rotation.set()` not `.rotation.x = ...` (artifact sandbox fix)

---

## Architecture

```
/app
  /api
    /agents         ← Agent dispatch endpoints (SSE)
    /stripe         ← Webhook handlers
    /vault          ← IP/patent scrub
  /dashboard        ← Main app shell
  /components
    /3d             ← Three.js scene (mahogany office)
    /agents         ← Agent cards, status, output streams
    /forge          ← Prompt Forge UI
/lib
  /anthropic.ts     ← Claude API wrapper (streaming)
  /supabase.ts      ← DB client + types
  /stripe.ts        ← Billing helpers
/agents             ← Agent definitions (SKILL.md pattern)
/hooks              ← Claude Code hooks (.claude/hooks/)
```

---

## Critical Patterns

### Anthropic Streaming (SSE)
```typescript
// Always stream — never await full response
const stream = await anthropic.messages.stream({
  model: 'claude-opus-4-5', // or sonnet for speed
  max_tokens: 8192,
  messages,
  system,
})
// Pipe to SSE response
```

### Clerk Auth Guard
```typescript
// Every API route must check auth
const { userId } = auth()
if (!userId) return new Response('Unauthorized', { status: 401 })
```

### Supabase RLS
```typescript
// Always use service role for server, anon for client
// Never bypass RLS on user-facing queries
// Check user_id matches auth().userId before any mutation
```

### Stripe Webhook
```typescript
// Always verify signature
const event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
// Handle: customer.subscription.created/updated/deleted
```

### Agent Dispatch Pattern
```typescript
// Agents are isolated — no shared context between dispatches
// Each agent gets: system prompt + task + relevant context only
// Return structured output for downstream consumption
```

---

## Security Requirements

- **No hardcoded secrets** — all keys via env vars, never in code or logs
- **Stripe webhooks** — always verify `stripe-signature` header
- **Supabase** — RLS enabled on all tables, no service-role client in browser
- **Clerk** — middleware.ts protects all `/dashboard/*` and `/api/*` except webhooks
- **Anthropic key** — server-side only, never exposed to client

---

## Database Schema (Supabase)

```sql
-- Core tables
users          (id, clerk_id, email, plan, created_at)
agents         (id, user_id, name, type, config, created_at)
dispatches     (id, user_id, agent_id, input, output, tokens, created_at)
subscriptions  (id, user_id, stripe_id, plan, status, period_end)
vault_scans    (id, user_id, content_hash, result, created_at)
```

---

## Plan/Task Management

- Plans live in `docs/plans/` — format: `YYYY-MM-DD-NNN-type-name-plan.md`
- Tasks tracked via TodoWrite/TodoRead in Claude Code
- Never rewrite working code to add a feature — extend it
- Commit after each complete unit of work

---

## Commands Available

| Command | Purpose |
|---------|---------|
| `/ns-plan` | Plan a Neural Swarm feature |
| `/ns-ship` | Execute current plan |
| `/ns-commit` | Commit with conventional message |
| `/ns-audit` | Run security audit on changed files |
| `/ns-stripe` | Stripe webhook + billing checklist |
| `/ns-supabase` | Check schema, RLS, migrations |
| `/ns-agent` | Scaffold a new agent |
| `/ns-debug` | Deep debugging session |
| `/ns-deploy` | Pre-deploy checklist + Vercel push |

---

## Agents Available (Subagents)

- `ns-architect` — system design, architecture decisions
- `ns-security` — security audit, insecure defaults check
- `ns-stripe` — billing, subscription, webhook specialist
- `ns-supabase` — DB schema, RLS, migrations specialist
- `ns-agent-builder` — scaffold new Neural Swarm agents
- `ns-debugger` — systematic root-cause debugging

---

## DO NOT

- Simulate agent behavior with fake setTimeout/state machines
- Expose Anthropic API key to client
- Bypass Clerk auth on any dashboard route
- Use `.rotation.x = ` directly in Three.js (use `.rotation.set()`)
- Add comments unless explicitly asked
- Build polished UI before core SaaS loop works (auth → use → pay)
- Ask for confirmation on trivial changes — just do it
