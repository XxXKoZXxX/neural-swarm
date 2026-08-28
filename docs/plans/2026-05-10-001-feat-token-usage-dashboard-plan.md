# Plan: Token Usage Dashboard — Per Agent Per Day

**Date:** 2026-05-10  
**ID:** 001  
**Type:** feat  
**Status:** ready

---

## Problem Frame

Users can see total cost on the Dashboard tab but have no visibility into **which agents consumed tokens** or **how spend trended day-by-day**. This matters for:
- Debugging runaway costs (one agent chewing 80% of budget)
- Understanding usage patterns to justify an upgrade

The `agent_runs` table stores `tokens_used` (run total) and an `agents` JSONB blob `{text, status}` — but **per-agent token counts are not saved**. They are tracked locally in `handleRun` (`tokCount`) but discarded at save time.

**Scope:** Dashboard tab only. No new DB tables. No new API routes. Client-side aggregation from already-loaded `runs` state.

---

## Implementation Units

### Unit 1 — Capture per-agent tokens at save time
**File:** `src/App.jsx`

In `handleRun`, the per-agent `tokCount` is currently block-scoped and lost. Extend `finals` to carry it:

```js
// Before (line ~539):
finals[step.name] = { text: full, status: "done" };

// After:
finals[step.name] = { text: full, status: "done", tokens: tokCount };
```

`saveRun` already passes `Object.fromEntries(Object.entries(outputs).map(...))` into the `agents` JSONB — the new `tokens` field will be saved automatically.

**Test:** After a run, open Supabase → `agent_runs` → inspect `agents` JSONB. Each agent entry should have `"tokens": <number>`.

---

### Unit 2 — Derive daily token data from loaded runs
**File:** `src/App.jsx` (dashboard section, ~line 583-589)

Add a derived computation alongside existing `agUsage` / `totalCost`:

```js
// Group token spend per agent per ISO date string
const tokensByDayAgent = {};   // { "2026-05-10": { ARCHITECT: 420, CODER: 1100, ... } }
const allDays = new Set();

runs.forEach(r => {
  const day = new Date(r.created_at).toISOString().slice(0, 10);
  allDays.add(day);
  Object.entries(r.agents || {}).forEach(([name, ag]) => {
    if (!tokensByDayAgent[day]) tokensByDayAgent[day] = {};
    tokensByDayAgent[day][name] = (tokensByDayAgent[day][name] || 0) + (ag.tokens || 0);
  });
});

const sortedDays = [...allDays].sort();  // ascending
```

This is pure derivation — no new state, no new fetch.

**Test:** `console.log(tokensByDayAgent)` in browser dev tools after loading runs that have per-agent tokens.

---

### Unit 3 — Render the usage chart in the Dashboard tab
**File:** `src/App.jsx` (dashboard tab JSX, after the existing 2-column grid ~line 833)

Add a new full-width section below the existing "AGENT USAGE" / "PLAN" grid:

```
┌─────────────────────────────────────────────────────────┐
│ TOKEN SPEND PER AGENT PER DAY                           │
│                                                         │
│  DATE        ARCH  CODER DEBUG  TEST  ... TOTAL        │
│  2026-05-08  ████  ██    ███    █         1,430        │
│  2026-05-09  █     █████ ██     ████      2,810        │
│  2026-05-10  ████  ████  █      ███       2,200        │
└─────────────────────────────────────────────────────────┘
```

Each row = one day. Each colored bar segment = one agent's token share.  
Stacked horizontal bar using CSS widths (no charting library needed).

**Fallback:** If `sortedDays.length === 0` or all agents have `tokens: 0` (pre-migration runs), show a muted "No token data yet — run an agent to populate." message.

**Test:** Dispatch one run → switch to Dashboard → verify the new section appears with the correct agent breakdown and date.

---

## Files to Create / Modify

| Action | Path | What changes |
|--------|------|--------------|
| Modify | `src/App.jsx:539` | Add `tokens: tokCount` to `finals[step.name]` |
| Modify | `src/App.jsx:583` | Add `tokensByDayAgent` / `sortedDays` derivation |
| Modify | `src/App.jsx:833` | Add token-per-day chart JSX in dashboard tab |

No new files. No DB migration required (tokens land in the existing `agents` JSONB column).

---

## Verification Criteria

1. After a new run, `agent_runs.agents` JSONB contains `tokens` field for each agent
2. Dashboard tab shows a "TOKEN SPEND PER AGENT PER DAY" section
3. Stacked bars are colored per agent (reuse `AGENTS[name].c`)
4. Rows sorted ascending by date
5. Old runs (no token data) render as empty bars without crashing
6. Section is hidden / shows placeholder when `runs.length === 0`

---

## Stripe / Auth Gate

No new gate needed. Dashboard is already visible to all users. Token data is derived from runs the user already owns.

---

## Non-Goals

- No server-side aggregation SQL (overkill for current scale)
- No date range picker (ship simple, add filter later)
- No export / CSV
- No real-time updates (refresh button already exists on Dashboard)
