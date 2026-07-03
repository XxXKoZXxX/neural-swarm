---
description: Plan a Neural Swarm feature using ce-plan workflow. Creates a structured plan in docs/plans/.
argument-hint: "[feature description or requirement]"
---

# Neural Swarm Feature Planning

You are planning a feature for **Neural Swarm** — a multi-agent AI orchestration SaaS (Next.js 14, Clerk, Supabase, Stripe, Anthropic API, Three.js).

## Feature to Plan
$ARGUMENTS

## Pre-Planning Context Check

Before planning, quickly scan:
1. `CLAUDE.md` — project rules, stack, patterns
2. `docs/plans/` — existing plans for dependencies
3. Affected area in codebase — identify existing patterns to follow

## Neural Swarm Planning Rules

- **Auth first**: Every new route needs Clerk middleware check. Plan it explicitly.
- **DB second**: If any new data, plan the Supabase table + RLS policy.
- **Stripe third**: If monetized, plan the subscription gate + usage limit.
- **Agent last**: Agent features need: system prompt, streaming SSE handler, UI stream consumer.
- **No simulated agents**: If the feature dispatches agents, plan real Anthropic API calls only.
- **3D UI**: Three.js changes must use `.rotation.set()` not direct property assignment.

## Output

Produce a plan document at `docs/plans/YYYY-MM-DD-NNN-feat-[name]-plan.md` following the ce-plan format with:
- Problem frame + scope
- Implementation units (ordered by: auth → db → api → ui → agents)
- Test scenarios per unit
- Files to create/modify (repo-relative paths)
- Verification criteria

After writing: ask whether to immediately run `/ns-ship` to execute it.
