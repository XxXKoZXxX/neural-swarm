/**
 * Unit tests for the pure logic — run with `npm test` (node:test, no deps).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPreviewDoc,
  detectSimAgent,
  diffTokens,
  extractCodeFiles,
  extractJson,
  FALLBACK_PLAN,
  mdToSimpleHtml,
  normalisePlan,
  parseFindings,
  runCost,
  simulatePlan,
  simulateStream,
} from "../src/lib/api.js";
import {
  AGENT_KEYS,
  estimateTokens,
  fmtCost,
  formatTastePrompt,
  modelProvider,
  scoreFromText,
  slugify,
} from "../src/lib/constants.js";
import { crc32, migrateLegacyStorage, toCsv, zipFiles } from "../src/lib/store.js";
import { buildRunScript } from "../src/lib/scripts.js";

/* ── constants ───────────────────────────────────────────────────────────── */
test("agent catalogue is intact", () => {
  assert.equal(AGENT_KEYS.length, 10);
  assert.ok(AGENT_KEYS.includes("DEBUGGER"));
});

test("scoreFromText reads the first /10 score", () => {
  assert.equal(scoreFromText("Score: 8.5/10 — ship it"), "8.5");
  assert.equal(scoreFromText("Score: 9 /10"), "9");
  assert.equal(scoreFromText("no score here"), null);
});

test("estimateTokens is a positive integer", () => {
  assert.ok(estimateTokens("hello world") >= 1);
  assert.ok(Number.isInteger(estimateTokens("a".repeat(400))));
  assert.equal(estimateTokens(""), 1);
});

test("slugify produces url-safe names", () => {
  assert.equal(slugify("Fix: Auth Bypass!! (critical)"), "fix-auth-bypass-critical");
  assert.equal(slugify(""), "untitled");
});

test("fmtCost never renders NaN", () => {
  assert.equal(fmtCost(null), "$0.00000");
  assert.match(fmtCost(0.0042), /^\$0\.00420$/);
});

test("modelProvider routes gemini ids to gemini", () => {
  assert.equal(modelProvider("gemini-2.5-flash"), "gemini");
  assert.equal(modelProvider("claude-sonnet-5"), "anthropic");
  assert.equal(modelProvider(""), "anthropic");
});

test("memory prompt only appears when enabled and populated", () => {
  const profile = { enabled: true, likes: ["typescript"], dislikes: [], rules: ["no emoji"] };
  const prompt = formatTastePrompt(profile);
  assert.match(prompt, /typescript/);
  assert.match(prompt, /no emoji/);
  assert.equal(formatTastePrompt({ ...profile, enabled: false }), "");
  assert.equal(formatTastePrompt({ enabled: true }), "");
});

test("runCost scales linearly with tokens", () => {
  assert.equal(runCost(1000), 1000 * 0.000003);
  assert.equal(runCost(null), 0);
});

/* ── JSON extraction ─────────────────────────────────────────────────────── */
test("extractJson tolerates prose and code fences", () => {
  assert.deepEqual(extractJson('```json\n{"agents":[{"name":"CODER"}]}\n```'), { agents: [{ name: "CODER" }] });
  assert.deepEqual(extractJson('Sure! Here is the plan:\n{"a":1}'), { a: 1 });
  assert.equal(extractJson("not json at all"), null);
});

test("extractJson repairs trailing commas", () => {
  assert.deepEqual(extractJson('{"a":1,"b":[1,2,],}'), { a: 1, b: [1, 2] });
});

/* ── planner normalisation ───────────────────────────────────────────────── */
test("normalisePlan drops unknown agents and de-duplicates", () => {
  const plan = normalisePlan(
    { agents: [{ name: "coder" }, { name: "CODER" }, { name: "NOPE" }, { name: "TESTER", instruction: "write tests" }] },
    ["CODER", "TESTER"],
    5,
  );
  assert.deepEqual(plan.agents.map((a) => a.name), ["CODER", "TESTER"]);
  assert.equal(plan.agents[1].instruction, "write tests");
});

test("normalisePlan enforces the agent limit", () => {
  const plan = normalisePlan({ agents: [{ name: "A" }, { name: "B" }, { name: "C" }] }, ["A", "B", "C"], 2);
  assert.equal(plan.agents.length, 2);
});

test("fallback plans always contain a verifier", () => {
  for (const goal of ["fix this bug", "audit my API for vulnerabilities", "design a landing page", "research databases", "build a CRM"]) {
    const plan = normalisePlan(FALLBACK_PLAN(goal), AGENT_KEYS, 5);
    assert.ok(plan.agents.length >= 2, `no agents for: ${goal}`);
    assert.equal(new Set(plan.agents.map((a) => a.name)).size, plan.agents.length);
  }
});

/* ── code extraction ─────────────────────────────────────────────────────── */
test("extractCodeFiles keeps declared paths and derives missing ones", () => {
  const text = "```ts src/a.ts\nconst a = 1;\n```\n\n```python\nprint('x')\n```\n";
  const files = extractCodeFiles(text, { agentName: "CODER" });
  assert.equal(files.length, 2);
  assert.equal(files[0].path, "src/a.ts");
  assert.equal(files[0].lang, "ts");
  assert.equal(files[1].lang, "python");
  assert.match(files[1].path, /^coder-2\.py$/);
});

test("extractCodeFiles ignores trivial blocks", () => {
  assert.equal(extractCodeFiles("```\nhi\n```").length, 0);
});

/* ── findings + preview ──────────────────────────────────────────────────── */
test("parseFindings groups severities and normalises HIGH/MEDIUM", () => {
  const text = [
    "[CRITICAL] auth bypass in /api/login",
    "  fix it now",
    "- [Major] unbounded body size",
    "* [high] leaked key",
    "MINOR: typo",
    "| MAJOR | sequence scan on owner_id | add a covering index |",
  ].join("\n");
  const findings = parseFindings(text);
  const severities = findings.map((f) => f.severity);
  assert.ok(severities.includes("CRITICAL"));
  assert.ok(severities.includes("MAJOR"));
  assert.ok(severities.includes("MINOR"));
  assert.ok(findings[0].title.length > 0);
  assert.match(findings[0].title, /auth bypass/);
  assert.ok(findings.some((f) => f.title.includes("sequence scan")), "table rows should be parsed");
});

test("mdToSimpleHtml escapes HTML instead of injecting it", () => {
  const html = mdToSimpleHtml("# hi\n\n<script>alert(1)</script>");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("buildPreviewDoc inlines sibling css and js into the html entry", () => {
  const files = [
    { path: "index.html", code: "<!doctype html><html><head></head><body><h1>hi</h1></body></html>", lang: "html" },
    { path: "styles.css", code: "h1{color:red}", lang: "css" },
    { path: "app.js", code: "console.log(1)", lang: "js" },
  ];
  const { html, kind } = buildPreviewDoc(files, { goal: "demo" });
  assert.equal(kind, "html");
  assert.match(html, /h1\{color:red\}/);
  assert.match(html, /console\.log\(1\)/);
});

test("buildPreviewDoc falls back to the spec view for jsx-only output", () => {
  const files = [{ path: "App.jsx", code: "export default function App(){return <div/>}", lang: "jsx" }];
  const { kind, html } = buildPreviewDoc(files, { goal: "demo", spec: "# Spec\n\nstuff" });
  assert.equal(kind, "jsx");
  assert.match(html, /spec preview/);
});

/* ── diffing ─────────────────────────────────────────────────────────────── */
test("diffTokens reports identical input as unchanged", () => {
  const d = diffTokens("const a = 1;", "const a = 1;");
  assert.equal(d.changed, 0);
  assert.equal(d.similarity, 100);
});

test("diffTokens marks inserted and deleted tokens", () => {
  const d = diffTokens("const a = 1;", "const a = 2; const b = 3;");
  assert.ok(d.changed > 0);
  assert.ok(d.right.some((t) => t.type === "ins"));
  assert.ok(d.left.some((t) => t.type === "del"));
});

/* ── storage helpers ─────────────────────────────────────────────────────── */
test("crc32 matches the known value for 'hello'", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
});

test("zipFiles produces a valid local file header and central directory", async () => {
  const blob = zipFiles([
    { path: "a.txt", code: "hello" },
    { path: "src/b.js", code: "console.log(1)" },
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50, "local header signature");
  const text = new TextDecoder().decode(bytes);
  assert.ok(text.includes("a.txt"));
  assert.ok(text.includes("src/b.js"));
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50, "end of central directory");
  assert.equal(view.getUint16(bytes.length - 22 + 10, true), 2, "entry count");
});

test("toCsv quotes values containing commas and quotes", () => {
  const csv = toCsv([{ a: 'x, y', b: 'say "hi"' }], ["a", "b"]);
  assert.equal(csv.split("\n")[0], "a,b");
  assert.match(csv, /"x, y"/);
  assert.match(csv, /"say ""hi"""/);
});

/* ── offline (simulated) engine ──────────────────────────────────────────── */
test("the offline engine identifies the agent from its name or system prompt", () => {
  assert.equal(detectSimAgent("", "TESTER"), "TESTER");
  assert.equal(detectSimAgent("You are a senior engineer. Write runnable code."), "CODER");
  assert.equal(detectSimAgent("You are a technical writer. Write READMEs."), "WRITER");
  assert.equal(detectSimAgent("You are a UI/UX designer."), "DESIGNER");
  assert.equal(detectSimAgent("something unrecognisable"), "CODER");
});

test("the offline coder produces a previewable project, not prose", async () => {
  const chunks = [];
  const res = await simulateStream({
    agent: "CODER",
    system: "You are a senior engineer.",
    messages: [{ role: "user", content: "GOAL: build a todo board\n\nYOUR TASK: implement" }],
    onToken: (c) => chunks.push(c),
  });
  assert.equal(res.simulated, true, "simulated runs must be flagged");
  assert.equal(chunks.join(""), res.text, "streamed chunks must equal the final text");
  const files = extractCodeFiles(res.text, { agentName: "CODER" });
  assert.ok(files.length >= 3, `expected html/css/js, got ${files.map((f) => f.path).join(", ")}`);
  assert.ok(files.some((f) => f.path.endsWith(".html")), "no html entry point");
  const doc = buildPreviewDoc(files, { goal: "todo board" });
  assert.match(doc.html, /<html/i);
  assert.ok(doc.html.length > 1000, "preview document looks empty");
});

test("the offline reviewer emits parseable severities", async () => {
  const res = await simulateStream({ agent: "REVIEWER", system: "Code review", messages: [{ role: "user", content: "GOAL: audit" }] });
  const findings = parseFindings(res.text);
  assert.ok(findings.some((f) => f.severity === "CRITICAL"), "expected a CRITICAL finding");
  assert.ok(findings.length >= 3, "expected several findings");
});

test("the offline overseer still returns a score line", async () => {
  const res = await simulateStream({ agent: "ANALYST", system: "You are the Overseer. Score the work.", messages: [{ role: "user", content: "GOAL: x" }] });
  assert.match(res.text, /^Score:\s*\d+(\.\d+)?\/10/m);
});

test("the offline planner falls back to a valid plan and labels itself", async () => {
  const plan = await simulatePlan({ settings: {}, goal: "build a SaaS billing portal", validNames: AGENT_KEYS, limit: 4 });
  assert.equal(plan.simulated, true);
  assert.ok(plan.agents.length >= 2, "planner returned too few agents");
  assert.ok(plan.agents.every((a) => AGENT_KEYS.includes(a.name)), "planner returned an unknown agent");
});

/* ── legacy data migration ───────────────────────────────────────────────── */
test("pre-makeover local data is migrated once and old keys are removed", () => {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
  map.set("ns_custom_agents", JSON.stringify([{ name: "AUDITOR", i: "🛡", c: "#f00", sys: "audit" }]));
  map.set("ns_taste_profile", JSON.stringify({ enabled: true, level: 3, xp: 90, likes: ["tabs"], logs: ["hello"] }));
  map.set("ns_vault_items", JSON.stringify([{ title: "RLS policy", content: "alter table x ...", tag: "Security" }]));
  map.set("ns_runs", JSON.stringify([{ id: "old1", goal: "ship it", agents: {}, overseer: "ok", created_at: "2026-01-01T00:00:00.000Z" }]));
  map.set("ns_webhook", "https://example.com/hook");
  map.set("ns_advanced_mode", "true");

  assert.equal(migrateLegacyStorage(), true);

  const agents = JSON.parse(map.get("ns.custom-agents"));
  assert.equal(agents[0].name, "AUDITOR");
  assert.equal(agents[0].icon, "🛡", "legacy icon key should be renamed");
  assert.equal(agents[0].color, "#f00");

  const memory = JSON.parse(map.get("ns.memory"));
  assert.equal(memory.level, 3);
  assert.deepEqual(memory.log, ["hello"], "legacy `logs` should become `log`");

  const vault = JSON.parse(map.get("ns.vault"));
  assert.equal(vault[0].title, "RLS policy");
  assert.ok(vault[0].id, "migrated vault items need ids");

  const runs = JSON.parse(map.get("ns.runs"));
  assert.equal(runs[0].goal, "ship it");
  assert.equal(runs[0].tokens_used, 0);

  const settings = JSON.parse(map.get("ns.settings"));
  assert.equal(settings.webhookUrl, "https://example.com/hook");
  assert.equal(settings.runOptions.chainMode, true);

  for (const legacy of ["ns_custom_agents", "ns_taste_profile", "ns_vault_items", "ns_runs", "ns_webhook", "ns_advanced_mode"]) {
    assert.equal(map.has(legacy), false, `${legacy} should be removed after migration`);
  }

  // A second visit must not resurrect anything or double-migrate.
  map.set("ns_custom_agents", JSON.stringify([{ name: "GHOST" }]));
  assert.equal(migrateLegacyStorage(), false);
  assert.equal(JSON.parse(map.get("ns.custom-agents")).length, 1, "existing data must not be overwritten");
});

/* ── run exporters ───────────────────────────────────────────────────────── */
test("exported scripts reproduce the plan without leaking a key", () => {
  const plan = [{ name: "ARCHITECT", instruction: "design it" }, { name: "CODER", instruction: "build it" }];
  const base = { goal: "ship a billing portal", plan, model: "claude-sonnet-5", maxTokens: 1600 };

  const node = buildRunScript({ ...base, format: "node" });
  assert.match(node, /^#!\/usr\/bin\/env node/);
  assert.match(node, /process\.env\.ANTHROPIC_API_KEY/);
  assert.match(node, /"ARCHITECT"/);
  assert.match(node, /ship a billing portal/);
  assert.doesNotMatch(node, /sk-ant-/, "scripts must never embed a key");

  const python = buildRunScript({ ...base, format: "python" });
  assert.match(python, /^#!\/usr\/bin\/env python3/);
  assert.match(python, /urllib\.request/);
  assert.match(python, /os\.environ\.get\("ANTHROPIC_API_KEY"\)/);

  const curl = buildRunScript({ ...base, format: "curl" });
  assert.match(curl, /^#!\/usr\/bin\/env bash/);
  assert.match(curl, /set -euo pipefail/);
  assert.equal((curl.match(/curl -s https:\/\/api\.anthropic\.com\/v1\/messages/g) || []).length, 2, "one curl per agent");

  // A script built from an empty plan still runs the goal through one agent.
  const fallback = buildRunScript({ format: "node", goal: "just this" });
  assert.match(fallback, /"CODER"/);
});
