# ⬡ Neural Swarm

> **10 specialized AI agents. One goal. Full output.**

Give Neural Swarm a goal. An orchestrator plans the execution. Agents run in sequence — architecting, coding, testing, reviewing. Every run is versioned, scored, and saved.

**Live demo:** [neural-swarm.vercel.app](https://neural-swarm.vercel.app) · **Get access:** [Gumroad](https://xxxxxkozxxxxx.gumroad.com)

---

## The 10 Agents

| Icon | Agent | What It Does |
|------|-------|--------------|
| ⬡ | **ARCHITECT** | System design, schemas, technical decisions. Production-grade. |
| ⌨ | **CODER** | Complete, runnable, production-ready code. Always includes a HOW TO RUN section. |
| 🐛 | **DEBUGGER** | Root-cause analysis, fully fixed output. No hand-waving. |
| ✓ | **TESTER** | Full test suites — edge cases, mocks, assertions included. |
| ◈ | **ANALYST** | Scores work /10, identifies weaknesses, gives a prioritized improvement plan. |
| ↺ | **REFACTORER** | Applies DRY, clean naming, design patterns. Outputs a change log + refactored code. |
| ◉ | **RESEARCHER** | Deep technical research with comparisons, tradeoffs, and version-specific details. |
| ✎ | **WRITER** | READMEs, docs, reports, any tone, any audience. |
| 👁 | **REVIEWER** | Principal-engineer code review: rates every issue CRITICAL / MAJOR / MINOR / NIT. |
| ◇ | **DESIGNER** | Detailed UI/UX direction: layout, palette, typography, components, UX flows. |

---

## How It Works

```
You type a goal
       ↓
Orchestrator picks 2–5 agents + writes per-agent instructions
       ↓
Agents execute in sequence, each receiving prior context
       ↓
Context compressor preserves key decisions when chains get long
       ↓
Overseer scores the full run /10 and lists what's still missing
       ↓
Run saved to Supabase with cost, score, branch, and version
```

Everything streams live. You watch agents think token by token.

---

## Features

### Prompt Forge
3,240 possible prompt transformations before any agent sees your goal.

- **18 Personalities** — Stoic Philosopher, Dark Detective, Mad Scientist, Corporate Lawyer, War General, Hacker Anarchist, Buddhist Monk, Wall Street Shark, Cold Bureaucrat, Silicon Valley CEO, Ancient Oracle, Rogue AI, Nihilist Scholar, Ruthless Strategist, Shadow Broker, Alien Anthropologist, Jaded Journalist, Burnt-Out Visionary
- **12 Tones** — Blunt & Brutal, Cold & Clinical, Poetic & Dense, Conspiratorial, Dry & Sardonic, Hyper-Technical, Cryptic Riddles, Bureaucratic, Raw & Unfiltered, Urgent Manifesto, Minimal & Precise, Noir Monologue
- **15 Output Constraints** — Max 80 words, No questions allowed, Numbered steps only, One sentence per idea, No adjectives, Begin with a quote, Use an analogy, End with a warning, Include a contradiction, No passive voice, Start mid-thought, Use a code metaphor, Never explain why, Dense single paragraph, Return only the core truth

### Version Control
Every run is a commit. Every goal is a branch.

- **Branch** — fork any run into a new experiment
- **Restore** — load any past run back into the editor
- **Diff** — side-by-side comparison of two runs: see exactly what each agent changed

### Overseer
After every run, a separate Overseer agent evaluates the full output chain against your original goal:

- Score: X/10
- What's missing
- Corrections
- Concrete next steps

### Template Marketplace
- 6 built-in templates: **Full App Builder**, **Bug Eliminator**, **Code Review Pro**, **Research Brief**, **SaaS Marketing Kit**, **Design System**
- Save your own workflows as templates
- Fork templates from the community
- Publish premium templates at any price — checkout via Stripe

### Context Compression
When a swarm runs 3+ agents, prior outputs are automatically compressed using Claude. Key technical decisions, code, and facts are preserved across the full chain.

### Real-time Cost Tracking
Every token counted. Cost displayed live per run at $0.000003/token. Saved to the run record alongside score and agent outputs.

### Auth + Persistence
- Sign up / sign in via Supabase Auth
- All runs auto-saved with history, cost, score, branch, and version number
- Last 40 runs loaded per session

### Pricing Tiers

| Tier | Price | Runs | Agents | History | Templates |
|------|-------|------|--------|---------|-----------|
| **FREE** | $0 | 5/month | 3/run | Basic | Community |
| **PRO** | $29/mo | Unlimited | All 10 | Full + versioning | Save & share |
| **POWER** | $79/mo | Unlimited | All 10 | Full + analytics | Team workspace + API |

Upgrades via Stripe. Template purchases handled inline.

### BYOK + Proxy
- Bring your own Anthropic API key — direct browser call, no middleman
- Or route through a Supabase Edge Function proxy (included)

### Self-Healing CI/CD — `sentinel.js`
Sentinel monitors GitHub Actions for failures, extracts logs from failed jobs, dispatches the DEBUGGER agent (Dark Detective personality), and files a GitHub Issue with the full root-cause diagnosis and fix.

```bash
npm run sentinel        # live: detects failures, creates GitHub issue
npm run sentinel:dry    # dry-run: diagnosis only, no side effects
```

Requires `GITHUB_TOKEN` (repo + actions:read) and `ANTHROPIC_API_KEY` in `.env`.

---

## Quick Start

```bash
git clone https://github.com/XxXKoZXxX/neural-swarm
cd neural-swarm
npm install
npm run dev
```

Open `http://localhost:5173`, enter your Anthropic API key in ⚙ Settings, type a goal, hit **LAUNCH THE SWARM**.

## Deploy in 30 Seconds

```bash
npx vercel --prod
```

Static Vite build — deploys anywhere. Zero backend required for core features.

## Supabase Setup (optional — enables persistence, auth, marketplace)

1. Create a Supabase project
2. Apply the schema and row level security policies:

```bash
supabase db push   # runs supabase/migrations/*.sql
```

3. Set the Edge Function secrets:

```bash
supabase secrets set ANTHROPIC_KEY=sk-ant-... \
  ALLOWED_ORIGINS=https://your-app.vercel.app,http://localhost:5173 \
  STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... \
  FRONTEND_URL=https://your-app.vercel.app
```

4. Configure the frontend via `.env` (see `.env.example`) — or paste the same
   values into ⚙ Settings in the app:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SWARM_PROXY_URL=https://your-project.supabase.co/functions/v1/swarm-proxy
```

The `swarm-proxy` and `stripe-checkout` functions require a signed-in user's
access token — the anon key alone is rejected, so the shared Anthropic key
cannot be used by anonymous callers.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite 8 |
| AI | Anthropic Claude Sonnet 4 — streaming SSE |
| Auth + DB | Supabase (optional) |
| Payments | Stripe (optional) |
| CI Sentinel | Octokit + Anthropic SDK (Node.js) |
| Deploy | Vercel |

Zero UI library dependencies. Zero backend required for core use.

---

## Roadmap

- [ ] Bug Bounty landing page — drop a GitHub URL, Debugger fixes it free once
- [ ] X / Build-in-Public bot
- [ ] Agent-to-agent memory across runs
- [ ] MCP server — use Neural Swarm agents from Claude Code

---

## License

MIT — use it, fork it, sell it.
