/**
 * Static product data: agents, models, presets, templates, plans.
 * Everything here is plain data so it can be unit-tested and reused by the
 * Node CLI in sentinel.js as well as the browser app.
 */

/** The ten built-in specialists. `sys` is the system prompt sent to the model. */
export const AGENTS = {
  ARCHITECT: {
    icon: "⬡",
    color: "#22d3ee",
    role: "System design",
    blurb: "Schemas, service boundaries, data models and build order.",
    sys: "You are a senior software architect. Design schemas, system breakdowns, and technical decisions. Be production-grade and concise.",
  },
  RESEARCHER: {
    icon: "◉",
    color: "#c084fc",
    role: "Research",
    blurb: "Options, tradeoffs and version-specific detail before code is written.",
    sys: "You are a technical researcher. Deep research with comparisons, tradeoffs, version-specific details.",
  },
  CODER: {
    icon: "⌨",
    color: "#34d399",
    role: "Implementation",
    blurb: "Complete, runnable code with a HOW TO RUN section.",
    sys: "You are a senior engineer. Write complete, runnable, production-ready code. Include a HOW TO RUN section.",
  },
  DEBUGGER: {
    icon: "🐛",
    color: "#fb923c",
    role: "Root cause",
    blurb: "Reproduces, isolates and patches real defects — no hand-waving.",
    sys: "You are a debugging specialist. Find real bugs, explain each one clearly, output fully fixed code.",
  },
  TESTER: {
    icon: "✓",
    color: "#facc15",
    role: "Verification",
    blurb: "Edge cases, mocks and assertions in a runnable suite.",
    sys: "You are a QA engineer. Write complete test suites with edge cases, mocks, and assertions.",
  },
  REVIEWER: {
    icon: "👁",
    color: "#f472b6",
    role: "Code review",
    blurb: "Principal-engineer review rated CRITICAL / MAJOR / MINOR / NIT.",
    sys: "You are a principal engineer. Code review: rate [CRITICAL/MAJOR/MINOR/NIT]. Correctness, security, performance.",
  },
  REFACTORER: {
    icon: "↺",
    color: "#38bdf8",
    role: "Cleanup",
    blurb: "DRY, naming, structure — with a change log and refactored output.",
    sys: "You are a refactoring expert. Apply DRY, clean naming, patterns. Output change log + refactored code.",
  },
  ANALYST: {
    icon: "◈",
    color: "#a78bfa",
    role: "Scoring",
    blurb: "Scores the work /10 and gives a prioritised improvement plan.",
    sys: "You are a critical analyst. Score work /10, identify weaknesses, give prioritized improvements.",
  },
  WRITER: {
    icon: "✎",
    color: "#fde68a",
    role: "Documentation",
    blurb: "READMEs, specs and reports in any tone for any audience.",
    sys: "You are a technical writer. Write READMEs, docs, reports. Adapt tone to the audience.",
  },
  DESIGNER: {
    icon: "◇",
    color: "#f43f5e",
    role: "Design",
    blurb: "Layout, palette, typography, components and UX flows.",
    sys: "You are a UI/UX designer. Detailed visual direction: layout, palette, typography, components, UX flows.",
  },
};

export const AGENT_KEYS = Object.keys(AGENTS);

export const getAgent = (name, custom = {}) =>
  custom[name] || AGENTS[name] || { icon: "⬡", color: "#94a3b8", role: "Custom", blurb: "", sys: "" };

/**
 * Model catalogue. Anthropic ids are the published dated ids so a real key
 * works out of the box; `custom` lets you paste any future id.
 */
export const MODELS = [
  { id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5", note: "Balanced default" },
  { id: "claude-opus-5", provider: "anthropic", label: "Claude Opus 5", note: "Deepest reasoning" },
  { id: "claude-fable-5", provider: "anthropic", label: "Claude Fable 5", note: "Creative writing" },
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", label: "Claude Haiku 4.5", note: "Fast + cheap" },
  { id: "claude-sonnet-4-5-20250929", provider: "anthropic", label: "Claude Sonnet 4.5", note: "Dated id fallback" },
  { id: "gemini-2.5-pro", provider: "gemini", label: "Gemini 2.5 Pro", note: "Long context" },
  { id: "gemini-2.5-flash", provider: "gemini", label: "Gemini 2.5 Flash", note: "Fast" },
  { id: "gemini-2.0-flash", provider: "gemini", label: "Gemini 2.0 Flash", note: "Cheapest" },
];

export const DEFAULT_MODEL = "claude-sonnet-5";
export const modelProvider = (id) =>
  MODELS.find((m) => m.id === id)?.provider || (String(id || "").startsWith("gemini") ? "gemini" : "anthropic");
export const modelLabel = (id) => MODELS.find((m) => m.id === id)?.label || id || "auto";

/* ── Prompt Forge ───────────────────────────────────────────────────────── */
export const PERSONALITIES = [
  "Stoic Philosopher", "Dark Detective", "Mad Scientist", "Corporate Lawyer",
  "War General", "Hacker Anarchist", "Buddhist Monk", "Wall Street Shark",
  "Cold Bureaucrat", "Silicon Valley CEO", "Ancient Oracle", "Rogue AI",
  "Nihilist Scholar", "Ruthless Strategist", "Shadow Broker", "Alien Anthropologist",
  "Jaded Journalist", "Burnt-Out Visionary",
];
export const TONES = [
  "Blunt & Brutal", "Cold & Clinical", "Poetic & Dense", "Conspiratorial",
  "Dry & Sardonic", "Hyper-Technical", "Cryptic Riddles", "Bureaucratic",
  "Raw & Unfiltered", "Urgent Manifesto", "Minimal & Precise", "Noir Monologue",
];
export const CONSTRAINTS = [
  "Max 80 words", "No questions allowed", "Numbered steps only", "One sentence per idea",
  "No adjectives", "Begin with a quote", "Use an analogy", "End with a warning",
  "Include a contradiction", "No passive voice", "Start mid-thought", "Use a code metaphor",
  "Never explain why", "Dense single paragraph", "Return only the core truth",
];

/* ── Plans / limits ─────────────────────────────────────────────────────── */
export const FREE_LIMIT = 5;
export const PLAN_TOKENS = { free: 1600, pro: 3200, power: 4800 };
/** Blended $/token so the cost meter moves even when the model is cheap. */
export const COST_PER_TOK = 0.000003;
export const PLANS = {
  free: { label: "Free", runs: FREE_LIMIT, agentsPerRun: 4, history: true, price: 0 },
  pro: { label: "Pro", runs: Infinity, agentsPerRun: 10, history: true, price: 29 },
  power: { label: "Power", runs: Infinity, agentsPerRun: 10, history: true, price: 79 },
};
export const UPGRADE_TIERS = [
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    per: "/month",
    color: "var(--accent)",
    features: ["Unlimited runs", "All 10 agents + custom agents", "Full history & diffing", "Live preview + workspace export"],
  },
  {
    id: "power",
    name: "Power",
    price: "$79",
    per: "/month",
    color: "var(--accent-violet)",
    features: ["Everything in Pro", "Team workspace", "Deep research & audit desks", "API access + webhooks"],
  },
];

/* ── Marketplace ────────────────────────────────────────────────────────── */
export const CATEGORIES = ["All", "Build", "Debug", "Research", "Marketing", "Design", "Other"];
export const SORTS = ["Popular", "Top rated", "Newest"];
export const BUILTIN_TEMPLATES = [
  { id: "t1", name: "Full app builder", desc: "Architect, code, test and document a complete app.", goal: "Build a complete production app for: ", tags: ["saas", "build"], cat: "Build", color: "#34d399", price: 0, usage: 412, rating: 4.9 },
  { id: "t2", name: "Bug eliminator", desc: "Deep debug, fix and regression-test any codebase.", goal: "Debug and fix:\n\n", tags: ["debug", "fix"], cat: "Debug", color: "#fb923c", price: 0, usage: 287, rating: 4.8 },
  { id: "t3", name: "Code review pro", desc: "Full review with severity ratings and a refactor plan.", goal: "Review this code:\n\n", tags: ["review", "quality"], cat: "Debug", color: "#f472b6", price: 0, usage: 198, rating: 4.7 },
  { id: "t4", name: "Research brief", desc: "Deep research with comparisons and an executive brief.", goal: "Research in depth: ", tags: ["research", "docs"], cat: "Research", color: "#c084fc", price: 0, usage: 163, rating: 4.6 },
  { id: "t5", name: "SaaS marketing kit", desc: "Positioning, landing copy and ad angles for any product.", goal: "Write a full marketing kit for: ", tags: ["marketing"], cat: "Marketing", color: "#a78bfa", price: 0, usage: 141, rating: 4.5 },
  { id: "t6", name: "Design system", desc: "Visual direction, component inventory and starter code.", goal: "Design and build a design system for: ", tags: ["design", "ui"], cat: "Design", color: "#f43f5e", price: 0, usage: 99, rating: 4.4 },
  { id: "t7", name: "Security audit", desc: "Three-stage audit with severity ratings and patch diffs.", goal: "Security audit and threat model for: ", tags: ["security", "audit"], cat: "Debug", color: "#22d3ee", price: 0, usage: 176, rating: 4.9 },
  { id: "t8", name: "Landing page", desc: "Copy, structure and build of a converting landing page.", goal: "Design and build a high-converting landing page for: ", tags: ["marketing", "web"], cat: "Marketing", color: "#facc15", price: 0, usage: 122, rating: 4.3 },
];

export const FLOW_PRESETS = [
  {
    id: "saas",
    name: "SaaS dev pipeline",
    desc: "Architect → Coder → Tester → Reviewer",
    nodes: ["ARCHITECT", "CODER", "TESTER", "REVIEWER"],
  },
  {
    id: "bounty",
    name: "Bug bounty scan",
    desc: "Researcher → Debugger → Reviewer",
    nodes: ["RESEARCHER", "DEBUGGER", "REVIEWER"],
  },
  {
    id: "polish",
    name: "Refactor & polish",
    desc: "Analyst → Refactorer → Tester",
    nodes: ["ANALYST", "REFACTORER", "TESTER"],
  },
  {
    id: "design",
    name: "UI/UX spec & code",
    desc: "Designer → Coder → Writer",
    nodes: ["DESIGNER", "CODER", "WRITER"],
  },
  {
    id: "research",
    name: "Research → decision",
    desc: "Researcher → Analyst → Writer",
    nodes: ["RESEARCHER", "ANALYST", "WRITER"],
  },
];

export const SAMPLE_GOALS = [
  { label: "SaaS MVP", goal: "Build a production Next.js 15 App Router SaaS starter with Supabase auth, row-level security and Stripe subscription webhooks." },
  { label: "Security audit", goal: "Audit this Node/Express + Postgres API for auth bypasses, SQL injection and leaked secrets." },
  { label: "Fix a race condition", goal: "Debug a React 19 async state race that causes stale UI and a memory leak in my dashboard." },
  { label: "Design system", goal: "Design a dark-mode glass UI kit with tokens, responsive components and accessibility notes." },
];

/* ── Utilities ──────────────────────────────────────────────────────────── */
export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const fmtCost = (n) => {
  const v = Number(n) || 0;
  if (v === 0) return "$0.00000";
  return `$${v.toFixed(v < 0.01 ? 5 : 4)}`;
};

export const fmtNum = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};

export const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
};

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Rough token estimate used for the live meter before the API responds. */
export const estimateTokens = (text = "") => Math.max(1, Math.round(String(text).length / 4));

export const scoreFromText = (text = "") => {
  const m = String(text).match(/(\d{1,2}(?:\.\d)?)\s*\/\s*10/);
  return m ? m[1] : null;
};

export const slugify = (s = "") =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "untitled";

/** Build the "learned taste" system-prompt suffix from the memory profile. */
export function formatTastePrompt(tp) {
  if (!tp || !tp.enabled) return "";
  const parts = [];
  if (tp.likes?.length) parts.push(`- PREFERRED PATTERNS: ${tp.likes.join("; ")}`);
  if (tp.dislikes?.length) parts.push(`- AVOID: ${tp.dislikes.join("; ")}`);
  if (tp.rules?.length) parts.push(`- USER DIRECTIVES: ${tp.rules.join("; ")}`);
  if (!parts.length) return "";
  return `\n\n[TEAM MEMORY — adapt to these learned preferences]:\n${parts.join("\n")}`;
}

export const STORAGE = {
  theme: "ns.theme",
  settings: "ns.settings",
  agents: "ns.custom-agents",
  vault: "ns.vault",
  memory: "ns.memory",
  runs: "ns.runs",
  workspace: "ns.workspace",
  flows: "ns.flows",
  onboarded: "ns.onboarded",
  usage: "ns.usage",
  history: "ns.history",
  ui: "ns.ui",
};
