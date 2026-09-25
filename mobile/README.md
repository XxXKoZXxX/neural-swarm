# ⬡ Neural Swarm — Android app

The standalone Neural Swarm app. Install it on your phone, tap the icon, and use
every feature — any model, any time — without opening the website.

It is a self-contained app with its own build. The Vite site in the repo root is
untouched by it.

---

## What's inside

| Screen | What it does |
|--------|--------------|
| **Chat** | Talk to any provider's model. Switch models mid-conversation and the whole thread comes along. **Compare** mode sends one prompt to several models at once. |
| **Swarm** | Give a goal. The orchestrator plans which of the 10 agents run, they execute in sequence with context compression, then the Overseer scores the result. |
| **Flow** | Touch DAG builder — drag agent nodes, link them with ⇢, run the pipeline in topological order. |
| **Vault** | Saved snippets, decisions and run outputs. Inject into any chat or swarm goal in one tap. |
| **Runs** | Every run versioned with score, tokens and cost. Branch, restore, duplicate, export, and diff two runs side by side. |
| **Setup** | Provider keys, model sync, defaults, PIN lock, install, import/export, erase. |

Also included: **Prompt Forge** (18 personalities × 12 tones × 15 constraints =
3,240 transformations), the **Dispatch Exporter** (paste-ready Node, Python and
cURL scripts for the last run), and a **share target** — share text from any
other Android app straight into Neural Swarm.

---

## Install it on the phone

The app is a PWA, which Chrome on Android installs as a real app: launcher icon,
splash screen, its own entry in the recents switcher, no URL bar, and it opens
when offline. No Play Store review, no SDK, no Mac.

**1. Get it onto an HTTPS URL.** Pick one:

```bash
# Deploy it (this is the easy permanent option)
cd mobile
npx vercel --prod          # → https://neural-swarm-app-xxxx.vercel.app
```

```bash
# Or run it locally and reach it over your Wi-Fi
cd mobile
npm install
npm run dev                # serves on 0.0.0.0:5174, prints a Network URL
```

> Chrome only offers to install over HTTPS or on `localhost`. A plain
> `http://192.168.x.x:5174` LAN address works as a page but will not offer the
> install prompt — use the deployed URL for the real install.

**2. Open that URL in Chrome on the phone.**

**3. Tap ⋮ → Add to Home screen / Install app.** Done — it launches from the
launcher like any other app.

On an iPhone: open in Safari → Share → **Add to Home Screen**. Same result.

---

## First run

1. Open **Setup**.
2. Paste a key for at least one provider. **OpenRouter is the fastest start** —
   one key unlocks Claude, GPT, Gemini, Grok and open-weight models.
3. Tap **↻ Sync models** to pull the live model lists.
4. Go to **Chat**, pick a model, and type.

| Provider | Key from | Notes |
|---|---|---|
| Anthropic | console.anthropic.com/settings/keys | Claude Opus 5.5, Sonnet 5, Haiku 4.5 |
| OpenAI | platform.openai.com/api-keys | GPT-5.5 / 5.4 family, o3, o4-mini |
| Google Gemini | aistudio.google.com/apikey | Gemini 3.8 Flash, 3.1 Pro |
| OpenRouter | openrouter.ai/keys | Hundreds of models, one key |
| Groq | console.groq.com/keys | Open-weight models, very fast, free tier |
| Mistral | console.mistral.ai/api-keys | Mistral Large, Codestral |
| xAI | console.x.ai | Grok |

Model lists are fetched live from each provider and merged over a built-in
fallback catalog, so a model released tomorrow shows up without an app update.
Prices are shown per model and spend is estimated on-device.

### Free local models

You can add a `local` endpoint in Setup (**Ollama**, **LM Studio**, or **Custom
endpoint**) and point it at a base URL:

- **On the phone itself** — install [Termux](https://termux.dev), then
  `pkg install ollama && ollama serve && ollama pull qwen3`.
- **On your computer over Wi-Fi** — run Ollama on the desktop and set the
  endpoint to `http://<computer-lan-ip>:11434/v1`.

Local servers reject browser origins by default. To let the app talk to Ollama:

```bash
OLLAMA_ORIGINS='*' ollama serve     # macOS / Linux
# Windows: set OLLAMA_ORIGINS=* then start Ollama
```

---

## Security

- API keys are entered on the device and stored in IndexedDB. There is no
  backend, no account, and no middleman — requests go straight from the phone to
  whichever provider owns the key.
- A PIN lock can gate the app so a borrowed phone cannot spend your credit.
- Errors are scrubbed of anything key-shaped before they are displayed.
- "Include API keys in the export" is off by default.
- The service worker caches only the app shell. Cross-origin API traffic is
  never cached.

---

## Develop

```bash
cd mobile
npm install
npm run dev        # http://localhost:5174, LAN-reachable
npm run build      # → dist/
npm run preview    # serve the production build on 4174
npm test           # 76 logic tests, no browser needed
node scripts/uitest.mjs   # 27 integration tests: mounts the real app in a DOM
npm run icons      # regenerate launcher icons (needs ImageMagick)
```

### Layout

```
src/lib/catalog.js     providers, models, prices, discovery merge
src/lib/providers.js   streaming adapters + model listing + error mapping
src/lib/agents.js      the 10 agents, Prompt Forge tables, planner, Overseer
src/lib/swarm.js       run engine + topological sort for the Flow builder
src/lib/store.js       IndexedDB with a localStorage fallback
src/lib/markdown.js    React-element markdown renderer (no innerHTML)
src/lib/diff.js        line diff for comparing runs
src/lib/platform.js    secure-context shims
src/screens/*          the six screens
src/components/*       UI kit, markdown message, model picker, agent card
```

Three streaming adapters cover every provider:

| Adapter | Covers |
|---|---|
| `anthropic` | Claude, via `/v1/messages` with the browser-access header |
| `openai` | OpenAI, OpenRouter, Groq, Mistral, xAI, DeepSeek, Ollama, LM Studio, vLLM, llama.cpp |
| `gemini` | Gemini, via `streamGenerateContent` |

`npm test` verifies all three against mocked SSE streams, including error
mapping, key redaction, model discovery, planner routing, diff correctness and
XSS-safe rendering. `scripts/uitest.mjs` mounts the actual App in a jsdom DOM and
drives it: switch tabs, save a key, stream a chat reply, run a two-agent swarm,
confirm the Overseer score lands and the run is saved.
