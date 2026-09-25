/**
 * Render smoke test.
 *
 * Server-renders every top-level view with representative props. This catches
 * the class of bug that made the previous build unusable — components that are
 * referenced but never defined, bad prop shapes, or crashes on first paint.
 *
 * Run with `npm run test:render` (bundled by Vite so JSX works in Node).
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* ── minimal browser stubs ──────────────────────────────────────────────── */
const memory = new Map();
const storage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
  key: (i) => [...memory.keys()][i] ?? null,
  get length() {
    return memory.size;
  },
};

globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.document = {
  documentElement: { dataset: {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ style: {}, setAttribute: () => {}, click: () => {}, remove: () => {} }),
  body: { appendChild: () => {}, removeChild: () => {} },
  querySelector: () => null,
  hidden: false,
};
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.Notification = { permission: "denied", requestPermission: async () => "denied" };
globalThis.fetch = async () => {
  throw new Error("network disabled in the render smoke test");
};

const { ToastProvider } = await import("../src/components/ui.jsx");
const { default: Landing } = await import("../src/components/Landing.jsx");
const { default: SwarmView } = await import("../src/components/SwarmView.jsx");
const { default: PreviewStudio } = await import("../src/components/PreviewStudio.jsx");
const { default: Workspace } = await import("../src/components/Workspace.jsx");
const { default: Terminal } = await import("../src/components/Terminal.jsx");
const { default: Canvas } = await import("../src/components/Canvas.jsx");
const { default: SecurityDesk } = await import("../src/components/SecurityDesk.jsx");
const { default: Research } = await import("../src/components/Research.jsx");
const { default: Vault } = await import("../src/components/Vault.jsx");
const { default: Marketplace } = await import("../src/components/Marketplace.jsx");
const { default: History } = await import("../src/components/History.jsx");
const { default: Insights } = await import("../src/components/Insights.jsx");
const { default: Brain } = await import("../src/components/Brain.jsx");
const { AuthModal, PublishModal, UpgradeModal } = await import("../src/components/Account.jsx");
const { default: Shell } = await import("../src/components/Shell.jsx");
const { default: Markdown } = await import("../src/components/Markdown.jsx");
const { default: App } = await import("../src/App.jsx");

/* ── fixtures ───────────────────────────────────────────────────────────── */
const settings = {
  anthropicKey: "",
  geminiKey: "",
  proxyUrl: "",
  supabaseUrl: "",
  supabaseKey: "",
  webhookUrl: "",
  model: "claude-sonnet-5",
  maxTokens: 1600,
  temperature: 1,
  rememberKeys: false,
  runOptions: { chainMode: false, parallel: false },
};

const output = (text, extra = {}) => ({ text, status: "done", elapsed: "2.4", tokens: 120, ...extra });

const swarm = {
  phase: "done",
  outputs: {
    ARCHITECT: output("# Architecture\n\n- api layer\n- data layer\n\n```sql schema.sql\nselect 1;\n```"),
    CODER: output("<html><body><h1>Hello</h1><script>console.log('hi')</script></body></html>", { simulated: true }),
    TESTER: output("- [MAJOR] missing index on owner_id\n- [MINOR] naming"),
  },
  plan: { agents: [{ name: "ARCHITECT", instruction: "design" }, { name: "CODER", instruction: "build" }], rationale: "smallest team" },
  overseer: "Score: 8.7/10\n\n## What's missing\n- nothing",
  log: [{ id: "1", at: Date.now(), agent: "CODER", level: "info", text: "started" }],
  tokens: 820,
  cost: 0.00246,
  progress: 100,
  error: "",
  goal: "build a thing",
  isRunning: false,
  abort: () => {},
  reset: () => {},
  run: async () => ({ ok: true }),
  retryAgent: async () => {},
  retryFailed: async () => 0,
  previewPlan: async () => ({ agents: [] }),
};

const files = [
  { id: "f1", path: "src/index.ts", lang: "ts", code: "export const a = 1;", agent: "CODER" },
  { id: "f2", path: "index.html", lang: "html", code: "<html></html>", agent: "CODER", edited: true },
];

const workspace = {
  files,
  stats: { count: 2, lines: 4, bytes: 60, edited: 1 },
  lastAdded: [],
  addFile: () => {},
  updateFile: () => {},
  renameFile: () => {},
  removeFile: () => {},
  clearAll: () => {},
  setFiles: () => {},
};

const run = {
  id: "r1",
  goal: "build a thing",
  branch: "main",
  version_num: 1,
  agents: { ARCHITECT: { text: "# plan", status: "done" }, CODER: { text: "code", status: "done" } },
  overseer: "Score: 8.7/10",
  score: "8.7",
  tokens_used: 820,
  cost: 0.00246,
  created_at: new Date().toISOString(),
};

const cases = [
  ["Landing", h(Landing, { theme: "dark", onToggleTheme: () => {}, onStart: () => {}, onStartWithGoal: () => {}, onSignIn: () => {}, onOpenDocs: () => {} }), ["Give it a goal", "Launch your first mission"]],
  [
    "Markdown",
    h(Markdown, {}, "## hi\n\n- a\n- b\n\n```js\nconst x = \"one\" + 42;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |"),
    // Highlighting emits the tokens as spans, so assert on the token classes.
    ["tok-key", "tok-str", "tok-num", "<table>"],
  ],
  ["SwarmView", h(SwarmView, { swarm, settings, updateSettings: () => {}, goal: "build a thing", setGoal: () => {}, planLimit: 4, onOpenTab: () => {}, onFeedback: () => {} }), ["Overseer verdict", "Execution plan"]],
  ["PreviewStudio", h(PreviewStudio, { swarm, goal: "build a thing", onOpenTab: () => {} }), ["Live preview"]],
  ["Workspace", h(Workspace, { ...workspace, onOpenTab: () => {} }), ["Download ZIP", "src/index.ts"]],
  ["Terminal", h(Terminal, { swarm, settings, workspace, goal: "g", onOpenTab: () => {} }), ["Terminal", "Auto-heal"]],
  ["Canvas", h(Canvas, { goal: "g", swarm, onOpenTab: () => {}, isGated: false, onUpgrade: () => {} }), ["Flow canvas", "Run this topology"]],
  ["SecurityDesk", h(SecurityDesk, { settings, onSaveVault: () => {}, setGoal: () => {}, onOpenTab: () => {}, isGated: false, onUpgrade: () => {} }), ["Security desk", "Risk summary"]],
  ["Research", h(Research, { settings, onSaveVault: () => {}, onInjectGoal: () => {}, isGated: false, onUpgrade: () => {} }), ["Deep research", "Run research"]],
  ["Vault", h(Vault, { items: [{ id: "v1", title: "RLS policy", content: "alter table x enable row level security;", tag: "Security", created_at: new Date().toISOString() }], setItems: () => {}, onInjectGoal: () => {}, onOpenTab: () => {} }), ["Neural Vault", "RLS policy"]],
  ["Marketplace", h(Marketplace, { templates: [], purchased: new Set(), settings, goal: "", canPublish: true, onUse: () => {}, onFork: () => {}, onPublish: () => {}, onOpenTab: () => {} }), ["Marketplace"]],
  ["History", h(History, { runs: [run], loading: false, sbReady: false, onRefresh: () => {}, onRestore: () => {}, onBranch: () => {}, onDelete: () => {}, onToggleStar: () => {}, onOpenTab: () => {} }), ["History", "build a thing"]],
  ["Insights", h(Insights, { runs: [run], plan: "free", onOpenTab: () => {} }), ["Insights", "Agent utilisation"]],
  ["Brain", h(Brain, { memory: { enabled: true, level: 2, xp: 140, likes: ["typescript"], dislikes: [], rules: [], log: [] }, setMemory: () => {}, runCount: 3 }), ["Team memory", "Preferred patterns"]],
  ["AuthModal", h(AuthModal, { supabase: {}, onSession: () => {}, onClose: () => {}, onLocal: () => {} }), ["Sign in"]],
  ["UpgradeModal", h(UpgradeModal, { open: true, used: 5, limit: 5, plan: "free", supabase: {}, jwt: "", onClose: () => {}, onDemoUnlock: () => {} }), ["Upgrade to Pro"]],
  ["PublishModal", h(PublishModal, { goal: "g", onPublish: () => {}, onClose: () => {}, initialName: "x" }), ["Publish as a template"]],
  [
    "Shell",
    h(Shell, { tab: "swarm", setTab: () => {}, theme: "dark", onToggleTheme: () => {}, swarm, plan: "free", isGated: false, onUpgrade: () => {}, session: null, onSignIn: () => {}, onSignOut: () => {}, settings, updateSettings: () => {}, counts: {}, onClearLocal: () => {}, onExportAll: () => {}, onHome: () => {}, runNow: () => {} }, h("div", {}, "child view")),
    ["Studio", "child view"],
  ],
  ["App (landing)", h(App), ["Give it a goal", "Pricing"]],
];

let failures = 0;
for (const [name, element, expectations] of cases) {
  try {
    const html = renderToStaticMarkup(h(ToastProvider, {}, element));
    if (!html || html.length < 200) throw new Error(`markup too short (${html?.length ?? 0} chars)`);
    for (const expected of expectations) {
      if (!html.includes(expected)) throw new Error(`missing expected text: “${expected}”`);
    }
    console.log(`ok   ${name} — ${html.length.toLocaleString()} chars`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${name}: ${err.message}`);
    console.error(String(err.stack).split("\n").slice(1, 5).join("\n"));
  }
}

console.log(`\n${cases.length - failures}/${cases.length} views rendered`);
if (failures) process.exit(1);
