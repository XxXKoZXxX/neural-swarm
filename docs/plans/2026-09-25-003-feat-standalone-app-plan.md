# Standalone Neural Swarm App — Build Plan

**Date:** 2026-09-25
**Type:** Feature
**Status:** In progress

## Goal

Let the owner use Neural Swarm's full feature set from a phone app — no browser
tab, no website visit, any model at any time. The app must be a first-class
install (launcher icon, full-screen, offline shell, share target), not a
bookmark to the existing site.

## Non-goals

- Shipping to the Play Store / App Store (needs a developer account and review).
- Replacing the website. `src/App.jsx` and the Vercel/Pages deploys stay intact.
- Reimplementing Stripe billing or Supabase marketplace in the app.

## Why a PWA (installable web app)

Chrome on Android installs a PWA as a real app — launcher icon, splash screen,
own task in the recents switcher, no URL bar, offline start, share-target
integration. It installs from a link in seconds and needs no store review, no
Android SDK, and no Mac. It is also the only install path that also works on
iOS, so an iPhone works identically if the owner switches devices.

## Architecture

```
mobile/                      ← self-contained app, its own package.json + build
  public/manifest.webmanifest  installable metadata, shortcuts, share target
  public/sw.js                 offline shell, network-first so dev never goes stale
  public/icons/*               generated launcher icons (192/512/maskable)
  src/lib/catalog.js           providers, models, context limits, pricing
  src/lib/providers.js         streaming adapters (anthropic | openai-compat | gemini)
  src/lib/agents.js            the 10 agents, Prompt Forge tables, orchestrator, Overseer
  src/lib/swarm.js             run engine: plan → agents → compress → oversee → cost
  src/lib/store.js             IndexedDB persistence (chats, runs, vault, flows, settings)
  src/screens/*                Chat · Swarm · Flow · Vault · Runs · Settings
```

### Model access — "any model at any time"

One unified `stream()` interface, three adapters cover every target:

| Adapter | Covers | Endpoint |
|---|---|---|
| `anthropic` | Claude | `POST /v1/messages` + browser-access header |
| `openai` | OpenAI, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, LM Studio, vLLM, **Ollama** | `POST {base}/chat/completions` |
| `gemini` | Gemini | `POST /v1beta/models/{m}:streamGenerateContent` |

Model lists are fetched live from each provider (`/v1/models`, `/api/tags`,
`/v1beta/models`) and merged over a curated fallback catalog, so a new model is
usable the day it ships and local models appear automatically. Keys live in
IndexedDB on the device and go only to the provider — no middleman, no server.

### Security

- No secrets in the repo; keys are entered on-device and stored in IndexedDB.
- Optional PIN lock gates the UI so a borrowed phone cannot spend the key.
- Service worker never caches cross-origin API traffic — only the app shell.
- Keys are redacted from every error message and export.

## Ship list

1. Foundation — config, manifest, service worker, icons, design system.
2. Model engine — catalog + streaming adapters + live model discovery.
3. Chat — multi-model, mid-conversation switching, compare mode (N models, one prompt).
4. Swarm — goal → orchestrator plan → agents → compressed context → Overseer score.
5. Prompt Forge — 18 personalities × 12 tones × 15 constraints.
6. Flow — touch DAG builder with presets, topological execution.
7. Vault — saved snippets, search, inject into any goal.
8. Runs — history, branch, restore, diff, export.
9. Settings — providers, model refresh, install prompt, PIN, data import/export.

## Verification

- `npm run build` clean, dev server reachable over LAN + preview host.
- Manifest passes installability (name, icons 192+512+maskable, start_url, display).
- Offline start verified by killing the server after first load.
- Every adapter exercised against a live provider before claiming it works.
