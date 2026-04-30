# Neural Swarm — 10-Agent AI Coding Assistant

> Bring 10 specialized AI experts to every coding session.

## The 10 Agents

| Agent | Role |
|-------|------|
| ⬡ Architect | System design, schemas, technical decisions |
| ⌨ Coder | Complete, runnable, production-ready code |
| 🐛 Debugger | Find real bugs, fully fixed output |
| ✓ Tester | Full test suites with edge cases and mocks |
| ◈ Analyst | Score /10, weaknesses, prioritized improvements |
| ↺ Refactorer | DRY, clean naming, design patterns |
| ◉ Researcher | Deep technical research, comparisons, tradeoffs |
| ✎ Writer | READMEs, docs, reports — any audience |
| 👁 Reviewer | Principal-level code review: CRITICAL/MAJOR/MINOR/NIT |
| ◇ Designer | UI/UX direction, layout, palette, components |

## Features

- 10 specialized agents with purpose-built system prompts
- 18 personality profiles (Stoic Philosopher, Dark Detective, Mad Scientist, Wall Street Shark...)
- 12 tone + 15 output constraints — shape every agent's voice
- Template marketplace: Full App Builder, Bug Eliminator, Code Review Pro, Research Brief, SaaS Marketing Kit
- Context compression — key decisions preserved forward across long sessions
- Real-time token cost tracking
- Streaming output — watch agents think live
- Bring your own Anthropic API key — no proxy, no middleman

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173, enter your Anthropic API key, start swarming.

## Deploy

```bash
npx vercel --prod
```

Static Vite/React — deploys anywhere in 30 seconds.

## Tech Stack

- React 19 + Vite 8
- Anthropic Claude API (claude-sonnet-4) — streaming SSE
- Zero backend, zero UI library dependencies

## License

MIT
