# ⬡ Neural Swarm

> **Ten specialised agents. One goal. A studio you can actually work in.**

Give Neural Swarm an outcome. The planner picks the smallest team that can finish it, the agents stream their work through a live rail, and the Overseer scores the delivery against your original goal. Everything that comes out is editable, previewable, diffable and exportable.

[![CI](https://github.com/XxXKoZXxX/neural-swarm/actions/workflows/deploy.yml/badge.svg)](https://github.com/XxXKoZXxX/neural-swarm/actions/workflows/deploy.yml)
[![Pages](https://github.com/XxXKoZXxX/neural-swarm/actions/workflows/pages.yml/badge.svg)](https://github.com/XxXKoZXxX/neural-swarm/actions/workflows/pages.yml)

**Live demo:** [neural-swarm.vercel.app](https://neural-swarm.vercel.app) · **Mirror:** [xxxkozxxx.github.io/neural-swarm](https://xxxkozxxx.github.io/neural-swarm/)

---

## Navigation

The app is built to be walked without instructions:

- **Deep links for everything.** Every view has an address — `#/files?path=src/app.js`, `#/history?run=r_12`, `#/vault?item=v_3`, `#/preview?device=mobile`. Share a link and the recipient lands on the same screen with the same file open.
- **Back works.** It is real browser navigation, so the back button and forward button step through views, exactly as expected.
- **One search box for the whole app** (`⌘K`, `Ctrl K` or `/`). It searches views, actions, files by path, runs by goal, vault notes and templates — grouped, ranked and keyboard driven.
- **On a phone:** a five-slot tab bar (Studio · Preview · Files · Terminal · More) plus a full-screen sheet with the other eight views, recent runs, install-as-app, theme, settings and account. Nothing scrolls off-screen, every target is thumb-sized, and you can **swipe left/right** to move between views.
- **Desktop:** the rail keeps its groups, remembers whether you collapsed it, and gains a breadcrumb bar with a Back button.

## The studio

| View | What it is |
|---|---|
| **Studio** | The composer: goal → plan → live agent rail → delivery → Overseer verdict. Chain or parallel execution, temperature, per-agent retry, Prompt Forge personas. |
| **Preview** | A real sandboxed iframe rendering what the swarm built, with desktop/tablet/mobile widths, a captured console, and spec mode when the output is not HTML. |
| **Files** | Multi-file workspace: the run's code fences become files (path-aware), editable inline, exportable as a ZIP. |
| **Terminal** | Live engine log plus an auto-heal console (`/heal`, `/test`, `/explain`, `/review`, or free text) that patches the workspace. |
| **Canvas** | Visual DAG builder: drag nodes, link ports, cycle-check, save flows, run the topology as a swarm. |
| **Security** | Three-stage audit (researcher → debugger → reviewer) with CRITICAL/MAJOR/MINOR/NIT findings, a risk summary and a GitHub-issue export. |
| **Research** | Deep-research briefs: sub-questions, tradeoff tables, confidence notes, saved straight to the vault. |
| **Vault** | The knowledge base — pin, search, export/import JSON, inject any item back into a goal. |
| **Marketplace** | Browse, fork and publish goal templates; everything is plain JSON so it travels well. |
| **History** | Every run, searchable, starred, restorable, branchable, and diffable two-at-a-time word by word. |
| **Insights** | Tokens, cost, score trend, agent utilisation and a 14-day activity chart. |
| **Memory** | The taste profile the swarm learns from 👍/👎 — likes, dislikes, hard rules, XP levels — injected into every prompt. |

Everything is keyboard-first (`⌘K` command palette, `⌘↵` run, `Esc` to abort, `1–9` to jump views), themed light or dark, and responsive down to a phone.

## The ten agents

| | Agent | What it does |
|---|---|---|
| ⬡ | **ARCHITECT** | Schemas, service boundaries, data models, build order. |
| ◉ | **RESEARCHER** | Options, tradeoffs, version-specific detail before code is written. |
| ⌨ | **CODER** | Complete, runnable code with a HOW TO RUN section. |
| 🐛 | **DEBUGGER** | Reproduces, isolates and patches real defects. |
| ✓ | **TESTER** | Edge cases, mocks and assertions in a runnable suite. |
| 👁 | **REVIEWER** | Review rated CRITICAL / MAJOR / MINOR / NIT. |
| ↺ | **REFACTORER** | DRY, naming, structure — plus a change log. |
| ◈ | **ANALYST** | Scores the work /10 with a prioritised plan. |
| ✎ | **WRITER** | READMEs, docs and reports in the tone you ask for. |
| ◇ | **DESIGNER** | Layout, palette, type scale, components, UX flows. |

Custom agents can be added in Settings — same contract, your icon, colour and system prompt.

## What you can take out

- **Markdown dispatch** — every agent's output plus the Overseer verdict in one file.
- **ZIP of the workspace** — the generated project as files, not a wall of text.
- **Script export** — the same goal, agent order and system prompts as a runnable Node, Python or cURL script. Your key is read from the environment and never embedded.
- **GitHub issue** — security findings formatted for triage.
- **Share / webhook** — hand a run to a gist or your own endpoint.
- **Full JSON backup** — one click from Settings, plus CSV for run history.

## Bring your own key (or don't)

Set an Anthropic key (and optionally a Gemini key) in **Settings**. Keys are written to `sessionStorage`, not `localStorage`, unless you explicitly ask to remember them on the device.

No key yet? The studio runs an **offline simulation engine** so every view stays explorable. Simulated runs are labelled as such everywhere — on each agent card, in the run header and in the Overseer verdict. Nothing is ever presented as real model output when it is not, and there is no markup on tokens either way.

Optional Supabase project (Settings) adds sync of runs, templates and auth. A bundled `swarm-proxy` edge function lets the operator run the swarm on a server key with an allowlist; everyone else must supply their own key.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run test:all     # lint + unit + render + click-through
npm run build        # production bundle in dist/
```

Node 22+.

### Scripts

| Script | What it runs |
|---|---|
| `npm run dev` / `build` / `preview` | Vite dev server, production build, local preview of `dist/`. |
| `npm run lint` | ESLint 9 over the whole tree. |
| `npm test` | 31 unit tests for the pure logic (no dependencies — `node:test`). |
| `npm run test:render` | Server-renders all 19 top-level views and asserts their markup. |
| `npm run test:dom` | Mounts the real app in jsdom and drives it: land → studio → every nav item → settings → ⌘K → theme → a full offline run → history → files → preview → script export. |
| `npm run test:mobile` | Same app at 390 × 844: tab bar, all-views sheet, swipe, deep links, browser back, the phone file picker and settings. |
| `npm run test:all` | Everything above, in that order. |
| `npm run sentinel` | CI-failure triage helper (`--dry-run` to preview without filing an issue). |

The click-through test exists because a green build cannot see a component that is referenced but never defined. That is exactly the class of bug this codebase shipped with before the makeover.

## Architecture

```
src/
  App.jsx                 state, routing between views, the run lifecycle
  main.jsx                entry, error boundary, legacy-data migration
  index.css               design system: tokens, utilities, components, themes
  lib/
    constants.js          agents, models, plans, templates, storage keys
    api.js                streaming model layer, orchestrator, parsers, diff, simulation
    store.js              storage, Supabase REST, downloads, ZIP, migration
    scripts.js            run → Node / Python / cURL exporters
    router.js             parse/serialise routes (pure, unit-tested)
    nav.js                the navigation model (rail, tab bar, sheet, palette)
  hooks/
    useSwarm.js           plan → agents → overseer, abort, retry
    useWorkspace.js       code fences → files (never clobbers your edits)
    usePersistedState.js  localStorage/sessionStorage state
    useRoute.js           hash routing (useSyncExternalStore)
    useMediaQuery.js      layout-critical breakpoints
    useInstallPrompt.js   PWA install flow
    useToast.js           toast context
  components/             ui.jsx, icons.jsx, Markdown.jsx, Shell.jsx,
                          CommandPalette.jsx, MobileNav.jsx + one file per view
tests/
  logic.test.js           unit tests
  smoke-entry.jsx         server-render smoke test
  dom-entry.jsx           jsdom click-through (desktop)
  mobile-entry.jsx        jsdom click-through (390px phone)
```

Zero UI dependencies: the icons, markdown renderer, syntax highlighter, charts, modal/drawer system and ZIP writer are all in this repo (React, React DOM and `@vercel/speed-insights` are the only runtime imports).

## Install it

The production build registers a service worker and ships a web app manifest, so the studio installs to a home screen and opens full-screen with no browser chrome. Navigations are network-first (a deploy is never masked by a stale cache), assets are stale-while-revalidate, and model calls are never cached. Chromium browsers get an **Install as an app** button in the phone sheet; on iOS it explains the Share → Add to Home Screen route.

## Privacy

No backend by default. Runs, files, flows, vault items, memory and history live in your browser's `localStorage`; secrets live in `sessionStorage`; "Export all data" in Settings gives you a JSON copy and "Reset local data" removes it. Upgrading from the pre-makeover build migrates the old `ns_*` keys automatically, once.

## Deployment

`main` deploys through `.github/workflows/deploy.yml`: lint → unit tests → render smoke → build → Vercel (staging, then production). `pages.yml` publishes the same build to GitHub Pages with `GITHUB_PAGES=true` so Vite emits the right base path. Required repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_NEURAL_SWARM`.

## License

Private project. Bring your own API key; tokens are billed by your provider, never marked up here.
