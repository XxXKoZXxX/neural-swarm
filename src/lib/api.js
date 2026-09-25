/**
 * Model layer.
 *
 * Three ways to reach a model, tried in order:
 *   1. Supabase edge-function proxy (keeps the key off the client)
 *   2. direct browser call with your own key (BYOK)
 *   3. offline simulation, so the product is fully explorable with no keys
 *
 * Simulation output is always flagged with `simulated: true` so the UI can
 * label it. It is never presented as a real model response.
 */
import { AGENTS, COST_PER_TOK, estimateTokens, modelProvider } from "./constants.js";

export class ApiError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

export const hasCreds = (settings = {}, provider) => {
  const p = provider || modelProvider(settings.model);
  if (p === "gemini") return Boolean(settings.geminiKey);
  return Boolean(settings.proxyUrl || settings.anthropicKey);
};

/* ── SSE reading ────────────────────────────────────────────────────────── */
async function readSse(res, onData, signal) {
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError("Response had no body to stream.", { retryable: true });
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          onData(JSON.parse(raw));
        } catch {
          /* keep-alive comment or partial frame — ignore */
        }
      }
    }
  } finally {
    reader.cancel?.().catch(() => {});
  }
}

async function errorMessage(res) {
  let message = `Request failed with HTTP ${res.status}`;
  try {
    const data = await res.json();
    message = data.message || data.error?.message || data.error || message;
  } catch {
    /* body was not JSON */
  }
  if (res.status === 401 || res.status === 403) message = `${message} — check your API key in Settings.`;
  if (res.status === 404) message = `${message} — that model id may not exist for your account.`;
  if (res.status === 429) message = `${message} — rate limited, try again shortly.`;
  return message;
}

/* ── Anthropic ──────────────────────────────────────────────────────────── */
async function streamAnthropic({ settings, system, messages, onToken, signal, maxTokens, temperature }) {
  const viaProxy = Boolean(settings.proxyUrl);
  const url = viaProxy ? settings.proxyUrl : "https://api.anthropic.com/v1/messages";
  const headers = viaProxy
    ? {
        "Content-Type": "application/json",
        ...(settings.jwt ? { Authorization: `Bearer ${settings.jwt}` } : {}),
        ...(settings.anthropicKey ? { "x-anthropic-key": settings.anthropicKey } : {}),
      }
    : {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      };

  const res = await fetch(url, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model: settings.model || "claude-sonnet-5",
      max_tokens: maxTokens || 1600,
      temperature: typeof temperature === "number" ? temperature : 1,
      stream: true,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), { status: res.status, retryable: res.status >= 500 || res.status === 429 });

  let text = "";
  await readSse(
    res,
    (ev) => {
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
        text += ev.delta.text;
        onToken?.(ev.delta.text);
      }
      if (ev.type === "error") throw new ApiError(ev.error?.message || "stream error");
    },
    signal,
  );
  return text;
}

/* ── Gemini ─────────────────────────────────────────────────────────────── */
const toGemini = (messages, system) => ({
  contents: messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  })),
  ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
});

async function streamGemini({ settings, system, messages, onToken, signal, maxTokens, temperature }) {
  const model = settings.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(settings.geminiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      ...toGemini(messages, system),
      generationConfig: {
        maxOutputTokens: maxTokens || 1600,
        ...(typeof temperature === "number" ? { temperature } : {}),
      },
    }),
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), { status: res.status, retryable: res.status >= 500 || res.status === 429 });

  let text = "";
  await readSse(
    res,
    (ev) => {
      const chunk = ev.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
      if (chunk) {
        text += chunk;
        onToken?.(chunk);
      }
    },
    signal,
  );
  return text;
}

/* ── public API ─────────────────────────────────────────────────────────── */
/**
 * Stream a completion. Returns { text, simulated, tokens }.
 * Throws ApiError for real failures; falls back to simulation only when the
 * user has supplied no credentials at all.
 */
export async function streamModel({ settings = {}, system = "", messages = [], onToken, signal, maxTokens, temperature, agent = "" }) {
  const provider = modelProvider(settings.model);
  if (!hasCreds(settings, provider)) {
    return simulateStream({ settings, system, messages, onToken, signal, agent });
  }
  const args = { settings, system, messages, onToken, signal, maxTokens, temperature };
  const text = provider === "gemini" ? await streamGemini(args) : await streamAnthropic(args);
  if (!text.trim()) throw new ApiError("The model returned an empty response.", { retryable: true });
  return { text, simulated: false, tokens: estimateTokens(text) };
}

/** Non-streaming convenience call used for planning, compression and scoring. */
export async function callModel({ settings = {}, system = "", messages = [], maxTokens = 900, temperature, signal }) {
  return streamModel({ settings, system, messages, maxTokens, temperature, signal });
}

/** Pull the first JSON object out of a model reply, tolerating prose fences. */
export function extractJson(text = "") {
  const cleaned = String(text).replace(/```json/gi, "```").trim();
  const fenced = cleaned.match(/```([\s\S]*?)```/);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  candidates.push(cleaned);
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    const slice = candidate.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      try {
        return JSON.parse(slice.replace(/,\s*([}\]])/g, "$1"));
      } catch {
        /* try the next candidate */
      }
    }
  }
  return null;
}

/* ── Orchestration ──────────────────────────────────────────────────────── */
export const ORCHESTRATOR_SYSTEM = (agentNames, limit) =>
  `You are the orchestrator of a multi-agent engineering swarm. Available agents: ${agentNames.join(", ")}. ` +
  `Choose between 2 and ${limit} agents that together fully solve the goal, in execution order. ` +
  `Give each one a specific, concrete instruction that names the actual deliverables. ` +
  `Reply with ONLY valid JSON: {"rationale":"one sentence","agents":[{"name":"AGENT","instruction":"..."}]}`;

export function normalisePlan(plan, validNames, limit) {
  const list = Array.isArray(plan?.agents) ? plan.agents : [];
  const seen = new Set();
  const agents = [];
  for (const entry of list) {
    const name = String(entry?.name || "").toUpperCase().trim();
    if (!validNames.includes(name) || seen.has(name)) continue;
    seen.add(name);
    agents.push({ name, instruction: String(entry?.instruction || `Contribute your ${name} expertise to the goal.`).slice(0, 600) });
    if (agents.length >= limit) break;
  }
  return { agents, rationale: String(plan?.rationale || "").slice(0, 300) };
}

export const FALLBACK_PLAN = (goal = "") => {
  const g = goal.toLowerCase();
  const security = /security|audit|vuln|exploit|pentest|threat/.test(g);
  const debug = /debug|bug|error|crash|fix|race|leak|broken/.test(g);
  const design = /design|ui|ux|landing|style|brand/.test(g);
  const research = /research|compare|evaluate|should i|market/.test(g);
  if (security)
    return {
      agents: [
        { name: "RESEARCHER", instruction: "Map the attack surface, threat model and the highest-risk assumptions." },
        { name: "DEBUGGER", instruction: "Trace each suspected vulnerability to a concrete exploit path with a patch diff." },
        { name: "REVIEWER", instruction: "Rate every finding CRITICAL/MAJOR/MINOR/NIT and flag false positives." },
      ],
      rationale: "Local plan: security work runs researcher → debugger → reviewer.",
    };
  if (debug)
    return {
      agents: [
        { name: "DEBUGGER", instruction: "Reproduce the failure, isolate the root cause and produce a verified fix." },
        { name: "TESTER", instruction: "Write regression tests that fail before the fix and pass after it." },
        { name: "REVIEWER", instruction: "Review the patch for side effects, performance and missing edge cases." },
      ],
      rationale: "Local plan: fixes are only done when they are verified.",
    };
  if (design)
    return {
      agents: [
        { name: "DESIGNER", instruction: "Produce the visual direction: layout, palette, type scale and component inventory." },
        { name: "CODER", instruction: "Implement the components as runnable code with a HOW TO RUN section." },
        { name: "WRITER", instruction: "Document the usage and the design tokens." },
      ],
      rationale: "Local plan: design → implementation → documentation.",
    };
  if (research)
    return {
      agents: [
        { name: "RESEARCHER", instruction: "Gather the credible options with version-specific detail and tradeoffs." },
        { name: "ANALYST", instruction: "Score the options against the goal and recommend one." },
        { name: "WRITER", instruction: "Write the executive brief with a decision and next steps." },
      ],
      rationale: "Local plan: research → analysis → brief.",
    };
  return {
    agents: [
      { name: "ARCHITECT", instruction: "Design the architecture, data model and build order." },
      { name: "CODER", instruction: "Implement the complete, runnable version with a HOW TO RUN section." },
      { name: "TESTER", instruction: "Write the test suite, including edge cases and failure paths." },
      { name: "REVIEWER", instruction: "Review the result with severity ratings and concrete fixes." },
    ],
    rationale: "Local plan: build pipelines always start with architecture.",
  };
};

export const OVERSIGHT_SYSTEM =
  "You are the Overseer of an agent swarm. Evaluate the delivered work against the user's goal. " +
  "Open with a score line exactly like `Score: 8.5/10`, then `## What's missing`, `## Corrections`, `## Next steps` as short bullet lists. Be specific and never invent work that was not delivered.";

export const compressorSystem =
  "Compress the agent outputs into at most 5 dense sentences. Preserve every technical decision, file path, API name, and constraint. Drop pleasantries.";

export async function compressContext({ ctx, goal, settings, api }) {
  if (!ctx.length) return "";
  const joined = ctx.map((c) => `[${c.agent}]: ${String(c.output).slice(0, 2000)}`).join("\n\n");
  const call = api || callModel;
  try {
    const { text } = await call({
      settings,
      system: compressorSystem,
      messages: [{ role: "user", content: `GOAL: ${goal}\n\n${joined}` }],
      maxTokens: 500,
    });
    return `\n\nPRIOR CONTEXT (compressed):\n${text.trim()}`;
  } catch {
    return `\n\nPRIOR CONTEXT:\n${ctx.map((c) => `[${c.agent}]: ${String(c.output).slice(0, 400)}`).join("\n\n")}`;
  }
}

/* ── Output parsing helpers ─────────────────────────────────────────────── */
const LANG_EXT = {
  javascript: "js", js: "js", jsx: "jsx", typescript: "ts", ts: "ts", tsx: "tsx",
  python: "py", py: "py", bash: "sh", sh: "sh", shell: "sh", zsh: "sh",
  html: "html", css: "css", scss: "scss", json: "json", yaml: "yml", yml: "yml",
  sql: "sql", md: "md", markdown: "md", go: "go", rust: "rs", java: "java",
  ruby: "rb", php: "php", swift: "swift", kotlin: "kt", c: "c", cpp: "cpp",
  dockerfile: "Dockerfile", toml: "toml", diff: "diff", text: "txt", env: "env",
  prisma: "prisma", graphql: "graphql", vue: "vue", svelte: "svelte",
};

const looksLikePath = (token = "") =>
  /^[\w./-]+\.[a-z0-9]{1,5}$/i.test(token) || /^[\w./-]+\/[\w./-]+$/.test(token);

/** Turn a concatenated agent output into a file list for the workspace. */
export function extractCodeFiles(text = "", { agentName = "output" } = {}) {
  const files = [];
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match;
  let index = 0;
  while ((match = re.exec(String(text)))) {
    const meta = (match[1] || "").trim();
    const code = match[2];
    // Skip empty fences and one-word placeholders.
    if (!code.trim() || code.trim().length < 4) continue;
    const tokens = meta.split(/[\s:]+/).filter(Boolean);
    let lang = tokens[0]?.toLowerCase() || "";
    let path = tokens.find((t, i) => i > 0 && looksLikePath(t)) || "";
    if (!path && looksLikePath(tokens[0])) {
      path = tokens[0];
      lang = "";
    }
    if (!path) {
      const ext = LANG_EXT[lang] || (lang ? lang : "txt");
      const base = ext === "Dockerfile" ? "Dockerfile" : `${agentName.toLowerCase()}-${index + 1}.${ext}`;
      path = base;
    }
    const filename = path.split("/").pop();
    const ext = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
    files.push({
      id: `${agentName}:${path}:${index}`,
      path: path.replace(/^\.?\//, ""),
      lang: lang || (ext === "yml" ? "yaml" : ext) || "text",
      code: code.replace(/\s+$/, ""),
      agent: agentName,
    });
    index += 1;
  }
  return files;
}

/** Severity buckets for the security desk. */
export const SEVERITIES = ["CRITICAL", "MAJOR", "MINOR", "NIT"];
const SEVERITY_ALIASES = { HIGH: "CRITICAL", MEDIUM: "MAJOR", LOW: "MINOR", INFO: "NIT", SEVERE: "CRITICAL" };

const normaliseSeverity = (raw = "") => {
  const upper = raw.toUpperCase();
  return SEVERITY_ALIASES[upper] || upper;
};

/**
 * Pull severity-labelled findings out of free-form model output.
 * Handles bullet lists ("- [MAJOR] …"), plain prefixes ("CRITICAL: …") and
 * the markdown tables reviewers like to produce ("| CRITICAL | title | fix |").
 */
export function parseFindings(text = "") {
  const findings = [];
  let current = null;
  const push = (severity, title) => {
    if (current) findings.push(current);
    current = { severity, title: String(title || "Finding").replace(/[*_`|]/g, "").trim().slice(0, 160) || "Finding", detail: "" };
  };

  for (const line of String(text).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current) current.detail += "\n";
      continue;
    }

    // markdown table row: | SEVERITY | title | rest…
    if (trimmed.startsWith("|")) {
      const cells = trimmed.replace(/^\|/, "").split("|").map((c) => c.trim());
      const severity = normaliseSeverity(cells[0]);
      if (SEVERITIES.includes(severity) && cells.length > 1) {
        const [title, ...rest] = cells.slice(1);
        push(severity, title);
        current.detail += rest.join(" · ");
        continue;
      }
    } else {
      const m = trimmed.match(/^(?:[-*+>#]|\d+[.)])?\s*\[?\b(CRITICAL|MAJOR|MINOR|NIT|HIGH|MEDIUM|LOW|INFO|SEVERE)\b\]?[\s:*\u2013-]*(.*)$/i);
      if (m) {
        const severity = normaliseSeverity(m[1]);
        if (SEVERITIES.includes(severity)) {
          push(severity, m[2]);
          continue;
        }
      }
    }
    if (current) current.detail += `${line}\n`;
  }
  if (current) findings.push(current);
  return findings.map((f) => ({ ...f, detail: f.detail.trim().slice(0, 1400) }));
}

/** Render extracted files into a single self-contained preview document. */
export function buildPreviewDoc(files = [], { goal = "", spec = "" } = {}) {
  const html = files.find((f) => /\.html?$/i.test(f.path));
  const css = files.filter((f) => /\.css$/i.test(f.path));
  const js = files.filter((f) => /\.(js|mjs)$/i.test(f.path));
  const hasJsx = files.some((f) => /\.(jsx|tsx|vue|svelte)$/i.test(f.path));

  if (html) {
    let doc = html.code;
    const linkedCss = css.map((f) => f.code).join("\n");
    const linkedJs = js.map((f) => f.code).join("\n;\n");
    if (linkedCss) doc = doc.includes("</head>") ? doc.replace("</head>", `<style>${linkedCss}</style></head>`) : `<style>${linkedCss}</style>${doc}`;
    if (linkedJs) doc = doc.includes("</body>") ? doc.replace("</body>", `<script>${linkedJs}</script></body>`) : `${doc}<script>${linkedJs}</script>`;
    return { html: doc, kind: "html", note: `Rendered ${html.path}${linkedCss || linkedJs ? " with linked CSS/JS" : ""}.` };
  }

  const specHtml = mdToSimpleHtml(spec || goal || "No preview yet.");
  const fileList = files.length
    ? `<ul>${files.map((f) => `<li><code>${escapeHtml(f.path)}</code> <span class="dim">${f.lang}</span></li>`).join("")}</ul>`
    : "<p class='dim'>No files extracted yet.</p>";
  const note = hasJsx
    ? "These are React/JSX sources — run them in your local toolchain. This is the spec view."
    : "No HTML entry point found — showing the generated specification.";
  return {
    kind: hasJsx ? "jsx" : "spec",
    note,
    html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0a0e13;color:#e6edf6;font:14px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:28px}
  h1{font-size:22px;margin:0 0 6px} h2{font-size:16px;margin:22px 0 8px;color:#8be9c0}
  p,li{color:#b9c4d3} code{background:#141c26;padding:1px 5px;border-radius:5px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px}
  .dim{color:#64748b;font-size:11px} ul{padding-left:20px} .pill{display:inline-block;padding:3px 9px;border-radius:99px;background:#12251d;color:#34d399;font-size:11px;margin-bottom:12px}
</style></head><body>
<span class="pill">spec preview</span>
<h1>${escapeHtml(goal.slice(0, 140) || "Generated preview")}</h1>
${specHtml}
<h2>Files produced</h2>
${fileList}
</body></html>`,
  };
}

const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Very small markdown → HTML used only inside the sandboxed preview iframe. */
export function mdToSimpleHtml(md = "") {
  const lines = escapeHtml(md).split("\n");
  const out = [];
  let inCode = false;
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      closeList();
      out.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}
const inline = (s) =>
  s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

/* ── Word-level diff (used by run comparison) ───────────────────────────── */
const tokenize = (s = "") => String(s).match(/\s+|[\w$#@./-]+|[^\s\w]/g) || [];

/** LCS diff limited to 1200 tokens per side to stay responsive. */
export function diffTokens(a = "", b = "") {
  const A = tokenize(a).slice(0, 1200);
  const B = tokenize(b).slice(0, 1200);
  const n = A.length;
  const m = B.length;
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * (m + 1) + j] = A[i] === B[j]
        ? dp[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const left = [];
  const right = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      left.push({ t: A[i], type: "same" });
      right.push({ t: B[j], type: "same" });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
      left.push({ t: A[i], type: "del" });
      i += 1;
    } else {
      right.push({ t: B[j], type: "ins" });
      j += 1;
    }
  }
  while (i < n) {
    left.push({ t: A[i], type: "del" });
    i += 1;
  }
  while (j < m) {
    right.push({ t: B[j], type: "ins" });
    j += 1;
  }
  const changed = left.filter((x) => x.type === "del").length + right.filter((x) => x.type === "ins").length;
  return { left, right, changed, similarity: Math.max(0, Math.round((1 - changed / Math.max(1, n + m)) * 100)) };
}

export const runCost = (tokens) => (Number(tokens) || 0) * COST_PER_TOK;

/* ── Offline simulation ─────────────────────────────────────────────────── */
function goalContext(messages = []) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const content = String(last?.content || "");
  const goalLine = content.match(/GOAL:\s*([\s\S]*?)(\n\n|$)/);
  const goal = (goalLine?.[1] || content).trim();
  const topic = (goal.split(/\s+/).find((w) => w.length > 4) || "project").replace(/[^\w-]/g, "");
  return { goal, topic, lower: goal.toLowerCase() };
}

/**
 * Which agent produced a simulated answer. The plan knows the agent name, but
 * older call sites only pass the system prompt, so keyword-detect as a fallback.
 */
const SIM_HINTS = [
  ["ARCHITECT", [/architect/i, /schema/i, /system breakdown/i]],
  ["RESEARCHER", [/researcher/i, /research/i, /tradeoff/i]],
  ["DEBUGGER", [/debug/i, /debugging specialist/i]],
  ["TESTER", [/qa engineer/i, /test suite/i, /\btests?\b/i]],
  ["REVIEWER", [/review/i, /code review/i]],
  ["REFACTORER", [/refactor/i, /\bDRY\b/]],
  ["ANALYST", [/critical analyst/i, /score .*\/10/i]],
  ["WRITER", [/technical writer/i, /readme/i, /documentation/i]],
  ["DESIGNER", [/ui\/ux/i, /visual direction/i, /designer/i]],
  ["CODER", [/senior engineer/i, /runnable/i, /\bcode\b/i]],
];

export function detectSimAgent(system = "", agent = "") {
  if (agent && SIM_NOTES[agent]) return agent;
  for (const [key, patterns] of SIM_HINTS) {
    if (patterns.some((re) => re.test(system))) return key;
  }
  return "CODER";
}

const word = (topic = "project") => topic.replace(/[^\w-]/g, "") || "project";

const SIM_NOTES = {
  ARCHITECT: ({ topic }) => `## Architecture for ${topic}

**Shape.** A thin HTTP edge (validation + auth), a service layer holding the rules, and a storage layer behind a repository interface. Nothing above the repository knows which database is underneath.

**Data model**

\`\`\`sql schema/001_init.sql
create table if not exists ${word(topic).toLowerCase()} (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists ${word(topic).toLowerCase()}_owner_idx on ${word(topic).toLowerCase()} (owner_id, created_at desc);

alter table ${word(topic).toLowerCase()} enable row level security;

create policy "owner reads own rows"
  on ${word(topic).toLowerCase()} for select
  using (auth.uid() = owner_id);
\`\`\`

**Build order.** 1) schema + migrations, 2) repository, 3) service, 4) HTTP layer, 5) UI, 6) observability.

**Risks.** Unbounded payload sizes, a missing index on \`owner_id\`, and no retry budget on the edge calls.`,

  RESEARCHER: ({ goal }) => `## Research brief — ${goal || "the goal"}

**Question.** Which stack gets this shipped fastest without painting us into a corner?

| Option | Strengths | Costs | Fit |
|---|---|---|---|
| Postgres + thin service | real constraints, one source of truth | migrations to manage | ★★★★☆ |
| Document store | flexible shape, fast start | weak relational queries | ★★★☆☆ |
| BaaS-first | auth + storage for free | vendor lock-in, price cliffs | ★★★☆☆ |

**Recommendation.** Postgres + a thin service layer. Keep every query behind a repository so the storage choice stays reversible.

**Confidence.** Medium — this is model knowledge without live browsing. Verify current versions and pricing before committing.

**Open questions.**
- Expected write volume in the first six months?
- Does the client need offline or multi-region reads?
- Who owns the migration runbook?`,

  CODER: ({ topic, goal }) => `## Implementation for ${topic}

A complete, runnable starting point for: *${goal || topic}*. No build step, no dependencies — open \`index.html\`.

\`\`\`html index.html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${word(topic)} board</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="shell">
    <header class="head">
      <h1>${word(topic)} board</h1>
      <p class="muted">Offline-engine starter — swap the store for your API.</p>
    </header>
    <form id="composer" class="composer">
      <input id="title" name="title" placeholder="What needs doing?" autocomplete="off" required />
      <button type="submit">Add</button>
    </form>
    <ul id="list" class="list"></ul>
    <footer class="foot"><span id="count">0 items</span><button id="clear" type="button">Clear done</button></footer>
  </main>
  <script src="app.js"></script>
</body>
</html>
\`\`\`

\`\`\`css styles.css
:root { color-scheme: dark; --bg:#0a0e13; --surface:#141c26; --line:#243040; --text:#e7eef7; --accent:#10b981; }
* { box-sizing: border-box; }
body { margin:0; background:radial-gradient(1100px 600px at 15% -10%, #12262b, var(--bg)); color:var(--text); font:15px/1.5 ui-sans-serif, system-ui, sans-serif; }
.shell { max-width:680px; margin:0 auto; padding:56px 20px; }
.head h1 { margin:0 0 6px; font-size:30px; letter-spacing:-.02em; }
.muted { color:#8aa0b6; margin:0 0 24px; }
.composer { display:flex; gap:8px; margin-bottom:18px; }
.composer input { flex:1; padding:12px 14px; border-radius:10px; border:1px solid var(--line); background:var(--surface); color:inherit; }
.composer button, .foot button { padding:12px 16px; border-radius:10px; border:0; background:var(--accent); color:#04120c; font-weight:650; cursor:pointer; }
.list { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.item { display:flex; align-items:center; gap:10px; padding:12px 14px; background:var(--surface); border:1px solid var(--line); border-radius:12px; }
.item.done { opacity:.55; text-decoration:line-through; }
.item button { margin-left:auto; background:none; border:0; color:#8aa0b6; cursor:pointer; }
.foot { display:flex; justify-content:space-between; align-items:center; margin-top:20px; color:#8aa0b6; font-size:13px; }
.foot button { background:none; border:1px solid var(--line); color:#8aa0b6; padding:8px 12px; }
\`\`\`

\`\`\`js app.js
const KEY = "swarm-board-items";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
let items = load();

const list = document.getElementById("list");
const count = document.getElementById("count");

function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {} }
function render() {
  list.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = item.done ? "item done" : "item";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = item.done;
    box.addEventListener("change", () => { item.done = box.checked; save(); render(); });
    const span = document.createElement("span");
    span.textContent = item.title;
    const del = document.createElement("button");
    del.textContent = "remove";
    del.addEventListener("click", () => { items = items.filter((i) => i.id !== item.id); save(); render(); });
    li.append(box, span, del);
    list.append(li);
  }
  count.textContent = items.length + (items.length === 1 ? " item" : " items");
}

document.getElementById("composer").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("title");
  const title = input.value.trim();
  if (!title) return;
  items.unshift({ id: crypto.randomUUID(), title, done: false });
  input.value = "";
  save();
  render();
});

document.getElementById("clear").addEventListener("click", () => {
  items = items.filter((i) => !i.done);
  save();
  render();
});

render();
\`\`\`

**HOW TO RUN.** Unzip the export, then open \`index.html\` — or \`npx serve .\` if you prefer a local server.

**Next.** Swap \`load/save\` for your API client; the render loop stays the same.`,

  DEBUGGER: ({ topic }) => `## Bugs found in ${topic}

**1 — race on the first write (high).** The handler reads the row, then inserts without a transaction, so two requests can both create the same key.

\`\`\`ts src/fix.ts
export async function createOnce<T>(key: string, make: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const existing = await tx.one("select id from items where key = $1 for update", [key]);
    if (existing) return tx.one("select * from items where id = $1", [existing.id]);
    return tx.insert(make);
  });
}
\`\`\`

**2 — unbounded body (medium).** Nothing caps \`payload\`; a 40 MB post will exhaust the pool. Add a size check at the edge.

**3 — swallowed errors (low).** \`catch {}\` hides the real failure. Log the error with its request id, then rethrow a typed error.`,

  TESTER: ({ topic }) => `## Test suite for ${topic}

\`\`\`ts tests/${word(topic).toLowerCase()}.test.ts
import { describe, expect, it } from "vitest";
import { createOnce } from "../src/fix";

describe("${word(topic)} service", () => {
  it("rejects an empty title", async () => {
    await expect(createOnce("", async () => ({}))).rejects.toThrow(/key/i);
  });

  it("is idempotent for the same key", async () => {
    const first = await createOnce("k1", async () => ({ id: 1 }));
    const second = await createOnce("k1", async () => ({ id: 2 }));
    expect(second.id).toBe(first.id);
  });

  it("survives a concurrent double submit", async () => {
    const [a, b] = await Promise.all([
      createOnce("race", async () => ({ id: 1 })),
      createOnce("race", async () => ({ id: 1 })),
    ]);
    expect(a.id).toBe(b.id);
  });
});
\`\`\`

**Coverage gaps.** Nothing exercises the size limit, the auth boundary, or a cold connection pool. Add those before shipping.`,

  REVIEWER: ({ topic }) => `## Review of ${topic}

- [CRITICAL] Owner checks are missing on the update path — any authenticated user can write to another row. Enforce \`auth.uid() = owner_id\` in the policy *and* the repository.
- [MAJOR] Unbounded \`payload\` and no request timeout; one slow client can exhaust the pool.
- [MAJOR] Errors are swallowed and rethrown as generic 500s, so the real cause never reaches the logs.
- [MINOR] Table name is pluralised in the SQL and singular in the code — pick one.
- [NIT] \`catch {}\` in \`app.js\`; at least leave a comment explaining why it is safe.

**Verdict.** Solid shape. Fix the CRITICAL before this touches production data.`,

  REFACTORER: ({ topic }) => `## Refactor plan for ${topic}

**Change log.** 1) Collapse three duplicated fetch helpers into one \`request()\`. 2) Rename \`data\`/\`d\` to intent-revealing names. 3) Move validation to the edge so the service can assume trusted input. 4) Replace boolean parameters with an options object.

\`\`\`ts src/http.ts
type Options = { retries?: number; timeoutMs?: number };

export async function request<T>(path: string, init: RequestInit = {}, { retries = 2, timeoutMs = 8000 }: Options = {}): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(path, { ...init, signal: controller.signal });
      if (!res.ok && res.status >= 500 && attempt < retries) continue;
      if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
      return (await res.json()) as T;
    } catch (error) {
      if (attempt >= retries) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
\`\`\`

**Behaviour is unchanged** — the retry budget is new, and it is bounded.`,

  ANALYST: ({ goal }) => `**Score: 7/10**

**What works.** The plan is ordered, the data model has real constraints, and the API surface is small enough to hold in your head. For the goal *${goal || "in scope"}* that is the right instinct.

**What does not.**
1. No failure path: every error assumption is "it will not happen".
2. Verification is one happy-path test; nothing checks the boundary you will actually hit.
3. The UI assumes a fast network on a cold start.

**Prioritised improvements.**
1. Add a migration runbook and rollback step.
2. Cover the concurrency path with a test before adding features.
3. Measure p95 latency and pool saturation before tuning anything.`,

  WRITER: ({ topic }) => `# ${topic} — documentation

## What it is
A focused service that owns ${word(topic)} data and exposes it through typed endpoints.

## Quick start
\`\`\`bash
npm install
cp .env.example .env   # fill in the values
npm run dev
\`\`\`

## Configuration
| Variable | Required | Notes |
|---|---|---|
| \`DATABASE_URL\` | yes | Pooled connection string |
| \`API_TOKEN\` | yes | Rotate quarterly |

## Troubleshooting
**401 on every request** — the token header is missing or the session expired. **Timeouts under load** — the pool is exhausted; raise the pool size before raising the timeout.`,

  DESIGNER: ({ topic }) => `## Visual direction for ${topic}

**Layout.** 12-column grid, 24 px gutters, content capped at 1120 px. Primary action always bottom-right of its card.

**Palette.** Ink \`#0a0e13\`, surface \`#141c26\`, accent \`#10b981\`, warning \`#f59e0b\`, danger \`#f43f5e\`. Never more than two accents on one screen.

**Type scale.** 12 / 13 / 15 / 20 / 28 / 40 px, weights 400–700, line height 1.5 for body and 1.15 for headings.

**Components.** Status pill, agent card with a live caret, progress meter, empty state, toast, data table with a sticky header.

**Flows.** Empty → goal typed → plan revealed → live agent rail → result + score. Every state must be reachable without a keyboard.`,
};

/** Offline text for one agent. Returns null for the orchestrator. */
function simulateFor(agentKey, system = "", ctx = {}) {
  if (/orchestrator/i.test(system)) return null; // handled separately
  if (system.includes("Overseer")) {
    return [
      "Score: 8.5/10",
      "",
      "## What's missing",
      "- Real API credentials — this run used the offline simulation engine.",
      "- End-to-end verification against your actual runtime and dependency versions.",
      "",
      "## Corrections",
      `- Replace the placeholder identifiers in the ${word(ctx.topic)} module with your real domain names.`,
      "- Wire the generated handlers to your database before shipping.",
      "",
      "## Next steps",
      "1. Add an API key in Settings and re-run this goal for real model output.",
      "2. Open **Files** to export what was generated, then open **Preview**.",
      "3. Re-run with Chain mode on so each agent can see the previous agent's work.",
    ].join("\n");
  }
  const build = SIM_NOTES[detectSimAgent(system, agentKey)];
  return build(ctx);
}

export async function simulateStream({ system = "", messages = [], onToken, signal, agent = "" } = {}) {
  const ctx = goalContext(messages);
  if (/orchestrator/i.test(system)) return { text: "", simulated: true, tokens: 0 };
  const text = simulateFor(agent, system, ctx) || simulateFor("CODER", AGENTS.CODER.sys, ctx);
  let sent = 0;
  for (let i = 0; i < text.length; i += 12) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const chunk = text.slice(i, i + 12);
    sent += chunk.length;
    onToken?.(chunk);
    // `__NS_SIM_DELAY` lets tests stream instantly without changing UX pacing.
    await new Promise((r) => setTimeout(r, globalThis.__NS_SIM_DELAY ?? 12));
  }
  return { text, simulated: true, tokens: estimateTokens(sent) };
}

/** Offline orchestrator plan. */
export async function simulatePlan({ settings, goal, validNames, limit }) {
  const plan = FALLBACK_PLAN(goal);
  const { agents } = normalisePlan(plan, validNames, limit);
  await new Promise((r) => setTimeout(r, globalThis.__NS_SIM_DELAY ?? 260));
  return {
    agents: agents.length ? agents : normalisePlan(FALLBACK_PLAN(""), validNames, limit).agents,
    rationale: `${plan.rationale} (offline planner${hasCreds(settings) ? "" : " — no API key set"})`,
    simulated: true,
  };
}
