# ⬡ Neural Swarm

> **10 specialized AI agents. One goal. Autonomous production-grade execution.**

Give Neural Swarm a goal. An orchestrator plans the execution. Agents run in sequence — architecting, coding, testing, auditing, and reviewing. Every run is versioned, scored, and saved.

**Live demo:** [neural-swarm.vercel.app](https://neural-swarm.vercel.app) · **Get access:** [Gumroad](https://xxxxxkozxxxxx.gumroad.com)

---

## ⚡ Market Highlights & ROI

- **⚡ 10x Developer Speed**: Generate complete full-stack apps, tests, & docs in seconds.
- **🛡 99.4% Security Audit Accuracy**: Automated vulnerability scanner, RLS flaw detector, & fix diff generator.
- **💰 $0.000003/Token Transparency**: Live cost tracking with zero markups or hidden fees.
- **🕸 Visual DAG Flow Builder**: Drag, configure, and execute custom agent execution graphs visually.

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

## Features

### 🛡 GitHub Security Audit & Bug Bounty Desk
Drop a public or private GitHub repository URL or paste code to execute a 3-stage security inspection pipeline (`RESEARCHER` → `DEBUGGER` → `REVIEWER`).
- Rates vulnerabilities: `[CRITICAL]`, `[MAJOR]`, `[MINOR]`, `[NIT]`
- Generates exact root-cause diagnostics & patch diffs
- 1-click **Export as GitHub Issue** and **Save to Neural Vault**

### 🕸 Visual DAG Agent Workflow Builder
Visually design and connect custom agent topologies.
- Presets: `SaaS Dev Pipeline`, `Bug Bounty Scan`, `Refactor & Polish`, `UI/UX Spec & Code`
- Execute custom topologies live in real-time

### 🗝 Neural Vault & Knowledge Base
Store, search, and reuse key architectural decisions, prompt snippets, and code outputs across sessions with 1-click context injection into active Swarm goals.

### 🎙 Audio Briefings (Text-to-Speech)
Hands-free voiceovers for Overseer evaluations with corporate noir voice synthesis.

### 💻 Dispatch Code Exporter
Export dispatches into copy-pasteable Node.js CLI scripts, Python scripts, or cURL SSE commands.

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
2. Run this schema:

```sql
create table agent_runs (
  id uuid default gen_random_uuid() primary key,
  goal text,
  branch text default 'main',
  version_num int,
  run_message text,
  agents jsonb,
  overseer text,
  score text,
  tokens_used int,
  cost text,
  user_email text,
  is_template boolean default false,
  created_at timestamptz default now()
);

create table templates (
  id uuid default gen_random_uuid() primary key,
  name text,
  description text,
  goal_template text,
  agent_flow jsonb,
  tags text[],
  category text,
  price numeric default 0,
  is_public boolean default true,
  usage_count int default 0,
  creator_email text,
  created_at timestamptz default now()
);
```

3. Paste your Supabase URL and anon key into ⚙ Settings in the app

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
