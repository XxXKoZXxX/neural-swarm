---
description: Execute the current Neural Swarm plan using subagent-driven development. Runs implementation units in dependency order.
argument-hint: "[optional: path to plan doc, or leave blank to use latest]"
---

# Neural Swarm — Ship It

Execute the current plan for Neural Swarm using parallel subagent dispatch where possible.

## Plan
$ARGUMENTS

If no plan path provided, find the latest active plan in `docs/plans/`.

## Execution Protocol

Use **subagent-driven development** pattern:
1. Read the plan completely
2. Map implementation units + their dependencies  
3. Dispatch independent units in parallel via Task tool
4. Sequential units execute in dependency order
5. Two-stage review after each unit: spec compliance → code quality
6. Commit after each completed unit (use `ce-commit` pattern)

## Neural Swarm Implementation Rules

**Auth units:** Always use `auth()` from `@clerk/nextjs/server` — never skip.

**DB units:** 
- Generate migration SQL for any schema changes
- Add RLS policy for every new table
- Test with both authenticated and unauthenticated requests

**Stripe units:**
- Always verify webhook signature with `stripe.webhooks.constructEvent()`
- Handle idempotency — webhooks fire multiple times
- Gate features on `subscription.status === 'active'`

**Agent units:**
- Use `anthropic.messages.stream()` — never `anthropic.messages.create()`
- Stream via SSE: `ReadableStream` + `data: {json}\n\n` format
- Each agent is stateless — full context in every dispatch

**Three.js units:**
- Use `.rotation.set(x, y, z)` — never `.rotation.x = ...`
- Mahogany `#4a1f0a` / Gold `#d4af37` / Amber terminal `#ff9900`

## Verification Before Done

Before marking any unit complete:
- [ ] TypeScript compiles without errors  
- [ ] Auth check present on all new routes
- [ ] No hardcoded secrets in code
- [ ] Streaming works end-to-end (for agent features)
- [ ] Committed to git with conventional message

Do not stop between units to ask for permission. Execute all units, commit each, then report.
