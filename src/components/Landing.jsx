import { useEffect, useState } from "react";
import { Badge, Button, Card } from "./ui.jsx";
import { Icon } from "./icons.jsx";
import { AGENTS, AGENT_KEYS, FREE_LIMIT } from "../lib/constants.js";

const DEMO = [
  { tone: "dim", text: "❯ goal  “multi-tenant invoicing API with Stripe billing”" },
  { tone: "accent", text: "⬡ planner  3 agents · architect → coder → reviewer" },
  { tone: "cyan", text: "⬡ architect  schema, RLS policies, service boundaries" },
  { tone: "green", text: "⌨ coder     12 files written · 1,840 lines" },
  { tone: "amber", text: "✓ tester    34 assertions · 0 failures" },
  { tone: "pink", text: "👁 reviewer 1 MAJOR (unbounded body) · patch attached" },
  { tone: "violet", text: "◈ overseer  Score: 8.7/10 — ship after the body limit" },
];

const FEATURES = [
  { icon: "play", title: "Live preview", body: "HTML, CSS and JS from the delivery are inlined into a sandboxed frame with a live console — errors surface before you ship." },
  { icon: "folder", title: "Multi-file workspace", body: "Every code fence becomes a file, grouped by path, editable inline and exportable as a real ZIP." },
  { icon: "shield", title: "Security desk", body: "Recon → exploit trace → verdict, rated CRITICAL/MAJOR/MINOR/NIT, exportable straight into a GitHub issue." },
  { icon: "flow", title: "Flow canvas", body: "Drag agents, wire the ports, and the graph runs as a pipeline — cycles are rejected before execution." },
  { icon: "brain", title: "Team memory", body: "👍 / 👎 feedback and finished runs tune a preference profile that is injected into every future brief." },
  { icon: "terminal", title: "Autonomous terminal", body: "/heal audits the delivery, explains the root cause and writes the patch back into the workspace." },
  { icon: "history", title: "Versioned history", body: "Every run is a version. Compare any two word-by-word, restore, or branch a new experiment." },
  { icon: "chart", title: "Cost + quality insights", body: "Tokens, spend, score trend and agent utilisation — with CSV export and no markup on tokens." },
  { icon: "key", title: "Bring your own key", body: "Direct browser calls with your own key, or route through the included Supabase proxy so the key never touches the client." },
];

const STEPS = [
  { n: "01", title: "Describe the outcome", body: "One brief. No prompt engineering ritual, no chain-of-thought babysitting." },
  { n: "02", title: "The swarm plans and builds", body: "The orchestrator picks the smallest team that can finish, then they work in order with shared context." },
  { n: "03", title: "Review, patch, export", body: "A scored verdict, a live preview, a file tree and a ZIP — plus every token accounted for." },
];

const FAQ = [
  { q: "Do I need an API key?", a: "No. With no key the studio runs an offline simulation engine so you can explore every view — preview, files, canvas, history and exports all work. Add a key (or point at the proxy) for real model output." },
  { q: "Where do my keys live?", a: "Keys stay in this browser by default: session storage unless you explicitly tick “remember on this device”. If you configure the Supabase proxy the key never reaches the client at all." },
  { q: "How is this different from one chat window?", a: "Specialisation plus hand-off. Each agent has a narrow mandate, sees the prior agent's work, and a separate Overseer scores the delivery against your original goal — so gaps get named instead of glossed over." },
  { q: "What does it cost to run?", a: "You pay your model provider directly. The app shows a live token and dollar meter per run at a blended $0.000003/token so there are no surprises." },
];

export default function Landing({ onStart, onStartWithGoal, onSignIn, onOpenDocs, onToggleTheme, theme }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t >= DEMO.length + 3 ? 0 : t + 1)), 900);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <nav className="landing-nav">
        <div className="row gap-10">
          <span className="row gap-8">
            <span className="dot" style={{ background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} />
            <span className="strong">Neural<span style={{ color: "var(--accent)" }}>Swarm</span></span>
          </span>
          <span className="dimmer tiny nowrap" style={{ display: "none" }}>
            studio
          </span>
        </div>
        <div className="row gap-8 landing-nav-actions">
          <button className="btn btn-ghost hide-sm" onClick={() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })}>
            Pricing
          </button>
          <button className="btn btn-ghost hide-sm" onClick={onOpenDocs}>
            Docs
          </button>
          <button className="btn btn-icon btn-ghost" onClick={onToggleTheme} aria-label="Toggle theme">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
          </button>
          <Button variant="ghost" className="hide-sm" onClick={onSignIn}>
            Sign in
          </Button>
          <Button variant="primary" size="sm" onClick={() => onStart()}>
            Start free
          </Button>
        </div>
      </nav>

      <nav className="landing-jump" aria-label="Sections">
        {[
          ["How it works", "how"],
          ["Agents", "agents"],
          ["Pricing", "pricing"],
        ].map(([label, id]) => (
          <button key={id} className="chip" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            {label}
          </button>
        ))}
      </nav>

      <section className="landing-section" id="how" style={{ borderTop: 0, paddingTop: 40 }}>
        <div className="landing-inner hero-grid">
          <div>
            <Badge tone="accent" icon="sparkles">
              Ten specialists · one goal · real deliverables
            </Badge>
            <h1 className="hero-title mt-16">
              Give it a goal.
              <br />
              Get back a <span className="gradient-text">shipped project</span>.
            </h1>
            <p className="muted mt-16" style={{ fontSize: 15, maxWidth: "56ch" }}>
              Neural Swarm orchestrates a team of specialised agents — architect, researcher, coder, debugger, tester, reviewer and more — that plan, build, verify and score the work. You bring the
              idea and your own model key; nothing is marked up.
            </p>
            <div className="row gap-10 wrap mt-24">
              <Button variant="primary" size="lg" icon="rocket" onClick={() => onStart()}>
                Launch your first mission
              </Button>
              <Button size="lg" icon="play" onClick={() => onStartWithGoal("Build a production-ready SaaS starter with auth, billing and tests.")}>
                Try a sample goal
              </Button>
            </div>
            <div className="row gap-16 wrap mt-16">
              <span className="dimmer tiny row gap-6">
                <Icon name="check" size={13} />
                {FREE_LIMIT} free runs
              </span>
              <span className="dimmer tiny row gap-6">
                <Icon name="check" size={13} />
                no card required
              </span>
              <span className="dimmer tiny row gap-6">
                <Icon name="check" size={13} />
                works offline with the simulation engine
              </span>
            </div>
          </div>

          <div className="card" style={{ overflow: "hidden", boxShadow: "var(--shadow-3)" }}>
            <div className="row gap-6" style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-soft)", background: "var(--bg-inset)" }}>
              <span className="dot" style={{ background: "#ff5f56" }} />
              <span className="dot" style={{ background: "#ffbd2e" }} />
              <span className="dot" style={{ background: "#27c93f" }} />
              <span className="dimmer tiny mono" style={{ marginLeft: 8 }}>
                neural-swarm · live mission
              </span>
            </div>
            <div className="console" style={{ border: 0, borderRadius: 0, minHeight: 232, padding: "14px 16px" }}>
              {DEMO.slice(0, Math.min(tick, DEMO.length)).map((line) => (
                <div key={line.text} className="console-line">
                  <span style={{ color: `var(--accent${line.tone === "dim" ? "" : `-${line.tone}`})`, opacity: line.tone === "dim" ? 0.7 : 1 }}>{line.text}</span>
                </div>
              ))}
              {tick < DEMO.length + 1 ? <span className="caret" /> : null}
              {tick >= DEMO.length + 1 ? <span className="dimmer">// replaying in a moment…</span> : null}
            </div>
            <div className="row between" style={{ padding: "10px 14px", borderTop: "1px solid var(--border-soft)" }}>
              <span className="dimmer tiny mono">~3,120 tokens · $0.0094</span>
              <Badge tone="accent" icon="star">
                Score 8.7/10
              </Badge>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-inner">
          <div className="grid-4">
            {[
              { k: "10", v: "specialised agents" },
              { k: "6", v: "delivery surfaces: preview, files, terminal, canvas, audits, briefs" },
              { k: "3,240", v: "prompt personas in the forge" },
              { k: "$0", v: "token markup — you pay your provider" },
            ].map((s) => (
              <div key={s.k} className="stat">
                <div className="stat-value gradient-text">{s.k}</div>
                <div className="tiny dim mt-4">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="agents">
        <div className="landing-inner">
          <div className="section-label">The specialists</div>
          <h2 className="page-title mt-8" style={{ fontSize: 26 }}>
            Ten narrow mandates beat one general assistant
          </h2>
          <p className="muted mt-8" style={{ maxWidth: "68ch" }}>
            Each agent has a defined output contract, so the hand-off is predictable. The orchestrator only calls the ones the goal actually needs.
          </p>
          <div className="auto-grid mt-24">
            {AGENT_KEYS.map((key) => {
              const a = AGENTS[key];
              return (
                <div key={key} className="feature-card">
                  <div className="row between">
                    <span style={{ fontSize: 20, color: a.color }}>{a.icon}</span>
                    <Badge>{a.role}</Badge>
                  </div>
                  <div className="strong mt-8">{key}</div>
                  <p className="tiny muted mt-4">{a.blurb}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-inner">
          <div className="section-label">Everything in the studio</div>
          <h2 className="page-title mt-8" style={{ fontSize: 26 }}>
            Built for the part after the chat window
          </h2>
          <div className="grid-3 mt-24">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature-card">
                <span className="row gap-8">
                  <Icon name={f.icon} size={16} style={{ color: "var(--accent)" }} />
                  <span className="strong small">{f.title}</span>
                </span>
                <p className="tiny muted mt-8">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-inner">
          <div className="section-label">How it works</div>
          <div className="grid-3 mt-16">
            {STEPS.map((s) => (
              <Card key={s.n} pad>
                <div className="mono tiny" style={{ color: "var(--accent)" }}>
                  {s.n}
                </div>
                <div className="strong mt-8">{s.title}</div>
                <p className="tiny muted mt-4">{s.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="pricing">
        <div className="landing-inner">
          <div className="section-label">Pricing</div>
          <h2 className="page-title mt-8" style={{ fontSize: 26 }}>
            Start free. Upgrade when it pays for itself.
          </h2>
          <div className="grid-3 mt-24">
            {[
              { name: "Free", price: "$0", per: "forever", features: [`${FREE_LIMIT} runs / month`, "All 10 agents", "Preview + workspace + ZIP", "Local history"], cta: "Start free", action: () => onStart(), featured: false },
              { name: "Pro", price: "$29", per: "/month", features: ["Unlimited runs", "Chained + parallel execution", "Full history with diffing", "Marketplace publishing"], cta: "Go Pro", action: () => onStart("pro"), featured: true },
              { name: "Power", price: "$79", per: "/month", features: ["Everything in Pro", "Team workspace", "Audit + research desks", "Webhooks and API access"], cta: "Talk to us", action: () => onStart("power"), featured: false },
            ].map((p) => (
              <div key={p.name} className={`price-card ${p.featured ? "featured" : ""}`}>
                <div className="row between">
                  <span className="section-label">{p.name}</span>
                  {p.featured ? <Badge tone="accent">most popular</Badge> : null}
                </div>
                <div className="row gap-4 mt-8" style={{ alignItems: "baseline" }}>
                  <span style={{ fontSize: 30, fontWeight: 750 }}>{p.price}</span>
                  <span className="dim small">{p.per}</span>
                </div>
                <div className="col gap-8 mt-16 grow">
                  {p.features.map((f) => (
                    <span key={f} className="row gap-8 tiny muted">
                      <Icon name="check" size={13} style={{ color: "var(--accent)" }} />
                      {f}
                    </span>
                  ))}
                </div>
                <Button variant={p.featured ? "primary" : "default"} className="mt-16" onClick={p.action}>
                  {p.cta}
                </Button>
              </div>
            ))}
          </div>
          <p className="dimmer tiny mt-12">
            Billing runs through Stripe. Model usage is billed by your own provider key — the app only ever reports what was spent.
          </p>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-inner">
          <div className="section-label">Questions</div>
          <div className="grid-2 mt-16">
            {FAQ.map((f) => (
              <Card key={f.q} pad>
                <div className="strong small">{f.q}</div>
                <p className="tiny muted mt-8">{f.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-inner" style={{ textAlign: "center" }}>
          <h2 className="hero-title" style={{ fontSize: 34 }}>
            The future isn't one assistant.
            <br />
            It's a <span className="gradient-text">team</span>.
          </h2>
          <div className="row center gap-10 wrap mt-24">
            <Button variant="primary" size="lg" icon="rocket" onClick={() => onStart()}>
              Start your first mission
            </Button>
            <Button size="lg" variant="ghost" onClick={onOpenDocs}>
              Read the docs
            </Button>
          </div>
        </div>
      </section>

      <footer className="landing-section footer-links" style={{ paddingTop: 28, paddingBottom: 28 }}>
        <div className="landing-inner row between wrap gap-16">
          <span className="dimmer tiny">© {new Date().getFullYear()} Neural Swarm · MIT licensed</span>
          <span className="row gap-16">
            <a href="./privacy.html">Privacy</a>
            <a href="./terms.html">Terms</a>
            <a href="./ai-agent-orchestration-tool.html">Orchestration guide</a>
            <a href="./claude-multi-agent-tool.html">Claude multi-agent guide</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
