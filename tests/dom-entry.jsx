/**
 * Browser-less click-through test.
 *
 * Mounts the real app in jsdom and drives it the way a user would: land →
 * studio → every navigation item → settings → command palette → a full
 * offline (simulated) swarm run → history/files/preview assertions.
 *
 * This is the gate that catches the failure mode a build cannot see —
 * components that are referenced but never defined, crashes on tab change,
 * or state that is read before it exists.
 *
 * Run with `npm run test:dom` (bundled by Vite, executed by Node).
 */
import { JSDOM, VirtualConsole } from "jsdom";

/* ── jsdom bootstrap ────────────────────────────────────────────────────── */
const virtualConsole = new VirtualConsole();
const jsdomNoise = [];
virtualConsole.on("jsdomError", (err) => jsdomNoise.push(String(err.message || err)));

const dom = new JSDOM(
  `<!doctype html><html lang="en" data-theme="dark"><head><title>test</title></head><body><div id="root"></div></body></html>`,
  { url: "https://studio.local/", pretendToBeVisual: true, virtualConsole },
);
const { window } = dom;

const define = (key, value) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
define("sessionStorage", window.sessionStorage);
for (const key of ["HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DOMParser", "Blob", "File", "FileReader", "FormData"]) {
  if (window[key] !== undefined) define(key, window[key]);
}
window.scrollTo = () => {};
window.URL.createObjectURL = () => "blob:stub";
window.URL.revokeObjectURL = () => {};
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, media: "", addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false });
}
define("matchMedia", window.matchMedia);
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
define("ResizeObserver", Observer);
define("IntersectionObserver", Observer);
window.ResizeObserver = Observer;
window.IntersectionObserver = Observer;
window.Element.prototype.scrollIntoView = () => {};
Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true });
define("clipboard", window.navigator.clipboard);
window.HTMLCanvasElement.prototype.getContext = () => ({
  canvas: null,
  save() {},
  restore() {},
  scale() {},
  clearRect() {},
  fillRect() {},
  strokeRect() {},
  beginPath() {},
  closePath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  fill() {},
  stroke() {},
  fillText() {},
  setTransform() {},
  translate() {},
  rotate() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  set fillStyle(v) {},
  set strokeStyle(v) {},
  set lineWidth(v) {},
  set globalAlpha(v) {},
  set font(v) {},
  set shadowBlur(v) {},
  set shadowColor(v) {},
});
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 900, height: 500, top: 0, left: 0, right: 900, bottom: 500, toJSON: () => ({}) });
// No network in the test: every model call must fall back to the offline engine.
globalThis.fetch = async () => {
  throw new Error("network disabled");
};
define("fetch", globalThis.fetch);
globalThis.__NS_SIM_DELAY = 0; // stream instantly, keep the same code path

/* ── react + app ────────────────────────────────────────────────────────── */
define("IS_REACT_ACT_ENVIRONMENT", true);
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;
const { ToastProvider } = await import("../src/components/ui.jsx");
const { default: App } = await import("../src/App.jsx");

const consoleErrors = [];
const originalError = console.error;
console.error = (...args) => {
  consoleErrors.push(args.map((a) => (a && a.stack) || String(a)).join(" "));
};

const log = [];
const fail = (name, message) => {
  log.push(`FAIL ${name}: ${message}`);
  process.exitCode = 1;
};
const pass = (name) => log.push(`ok   ${name}`);

/* ── helpers ────────────────────────────────────────────────────────────── */
const container = document.getElementById("root");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function flush(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await sleep(0);
    });
  }
}

const text = () => container.textContent || "";

function all(selector) {
  return [...container.querySelectorAll(selector)];
}

function byText(needle, selector = "button") {
  const probe = needle.toLowerCase();
  return all(selector).find((el) => (el.textContent || "").trim().toLowerCase().includes(probe));
}

async function click(el, what = "element") {
  if (!el) throw new Error(`cannot click missing ${what}`);
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await flush(1);
}

async function type(el, value) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await flush(1);
}

async function key(target, keyName, extra = {}) {
  await act(async () => {
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true, ...extra }));
  });
  await flush(1);
}

async function waitFor(predicate, { label = "condition", timeout = 8000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await act(async () => {
      await sleep(20);
    });
  }
  throw new Error(`timeout waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/* ── the run ────────────────────────────────────────────────────────────── */
const root = createRoot(container);
try {
  await act(async () => {
    root.render(
      React.createElement(ToastProvider, null, React.createElement(App)),
    );
  });
  await flush();
} catch (err) {
  fail("mount", err.message);
}

const TABS = [
  ["Studio", null],
  ["Preview", "Live preview"],
  ["Files", "Workspace"],
  ["Terminal", "Terminal"],
  ["Canvas", "Flow canvas"],
  ["Security", "Security desk"],
  ["Research", "Deep research"],
  ["Vault", "Neural Vault"],
  ["Marketplace", "Marketplace"],
  ["History", "History"],
  ["Insights", "Insights"],
  ["Memory", "Team memory"],
];

/* 1 — the landing page renders and can be left. */
try {
  assert(text().includes("Launch your first mission"), "landing CTA missing");
  await click(byText("Launch your first mission"), "landing CTA");
  assert(text().includes("Launch the swarm") || text().includes("Upgrade to run"), "studio composer missing");
  assert(text().includes("Welcome to Neural Swarm"), "first visit to the studio should show the welcome overlay");
  await click(byText("Explore first"), "onboarding dismiss");
  assert(!text().includes("Welcome to Neural Swarm"), "welcome overlay did not close");
  assert(text().includes("Launch the swarm") || text().includes("Upgrade to run"), "composer hidden after dismissing welcome");
  pass("landing → studio + welcome overlay");
} catch (err) {
  fail("landing → studio", err.message);
}

/* 2 — every navigation destination mounts and paints a heading. */
for (const [navLabel, heading] of TABS) {
  try {
    await click(byText(navLabel, ".rail-link"), `nav ${navLabel}`);
    await flush(2);
    if (heading) {
      assert(text().includes(heading), `“${heading}” heading not found after clicking ${navLabel}`);
    }
    assert(!text().includes("Something broke"), `error boundary tripped on ${navLabel}`);
    pass(`tab ${navLabel}`);
  } catch (err) {
    fail(`tab ${navLabel}`, err.message);
  }
}

/* 3 — settings drawer opens and closes. */
try {
  await click(all('button[aria-label="Settings"]')[0] || byText("Settings", "button"), "settings icon");
  assert(text().includes("Anthropic key") || text().includes("Settings"), "settings drawer did not render");
  await click(all('button[aria-label="Close"]')[0] || byText("Close", "button"), "settings close");
  pass("settings drawer");
} catch (err) {
  fail("settings drawer", err.message || String(err));
}

/* 4 — command palette opens with the keyboard and navigates. */
try {
  await key(document.body, "k", { ctrlKey: true });
  const input = container.querySelector('input[aria-label="Command input"]');
  assert(input, "palette input missing");
  await type(input, "insights");
  await flush(2);
  const hit = all(".palette-item, [role='option'], button").find((el) => (el.textContent || "").toLowerCase().includes("insights"));
  await click(hit, "palette result");
  assert(text().includes("Insights"), "palette did not navigate to Insights");
  pass("command palette ⌃K");
} catch (err) {
  fail("command palette", err.message);
}

/* 5 — theme toggle flips the document attribute. */
try {
  const before = document.documentElement.dataset.theme;
  await click(all('button[aria-label="Toggle theme"]')[0], "theme toggle");
  assert(document.documentElement.dataset.theme !== before, "theme did not change");
  pass(`theme toggle (${before} → ${document.documentElement.dataset.theme})`);
} catch (err) {
  fail("theme toggle", err.message);
}

/* 6 — a full offline run: goal → agents → overseer → history + files. */
try {
  await click(byText("Studio", ".rail-link"), "nav Studio");
  const composer = container.querySelector("textarea");
  await type(composer, "Build a todo API with Postgres and a test suite.");
  await click(byText("Launch the swarm"), "run button");
  await waitFor(() => all("article[data-agent]").length > 0 && /Score:\s*\d/.test(text()), { label: "run to finish", timeout: 20000 });
  await flush(3);
  const body = text();
  const cards = all("article[data-agent]");
  assert(cards.length >= 2, `expected at least two agent cards, saw ${cards.length}`);
  assert(cards.some((c) => /simulated/i.test(c.textContent)), "offline output is not marked simulated");
  assert(/Score:\s*\d/.test(body), "overseer score missing from a finished run");

  await click(byText("History", ".rail-link"), "nav History");
  await flush(2);
  assert(text().includes("Build a todo API"), "run was not saved to history");
  pass("offline run → delivery → history");

  await click(byText("Files", ".rail-link"), "nav Files");
  await flush(2);
  assert(all(".tree-item").length > 0, "run output produced no files in the workspace");
  const total = Number((text().match(/(\d+) files/) || [])[1] || 0);
  assert(total >= 3, `expected the generated project to have several files, saw ${total}`);
  pass(`workspace populated from run output (${total} files)`);

  await click(byText("Preview", ".rail-link"), "nav Preview");
  await flush(2);
  const frame = container.querySelector("iframe[srcDoc], iframe[srcdoc]");
  assert(frame, "preview iframe missing");
  const doc = frame.getAttribute("srcdoc") || frame.getAttribute("srcDoc") || "";
  assert(/<html/i.test(doc), "preview document is not html");
  assert(/swarm-board|board/i.test(doc), "preview document does not contain the generated app");
  pass(`live preview renders the generated app (${doc.length.toLocaleString()} chars)`);

  await click(byText("Studio", ".rail-link"), "nav Studio");
  await click(byText("Export as script"), "export as script");
  assert(/ANTHROPIC_API_KEY/.test(text()), "script modal does not mention the env var");
  await click(byText("Python", "button"), "python tab");
  assert(/urllib/.test(text()), "python script variant did not render");
  await click(byText("Close", "button"), "script modal close");
  assert(!/urllib/.test(text()), "script modal did not close");
  pass("run exports as node/python/curl scripts");
} catch (err) {
  fail(
    "offline run",
    `${err.message || err} | cards=${all("article[data-agent]").length} | composer=${/Launch the swarm/.test(text())} | tail=…${text().slice(-320)}`,
  );
}

/* 7 — no React errors were logged during any of it. */
try {
  const real = consoleErrors.filter(
    (e) =>
      !/Download the React DevTools/.test(e) &&
      !/not wrapped in act/.test(e) &&
      !/jsdom/i.test(e),
  );
  assert(real.length === 0, `${real.length} console error(s):\n${real.slice(0, 5).join("\n---\n")}`);
  pass("no React errors logged");
} catch (err) {
  fail("console errors", err.message);
}

console.error = originalError;
console.log(log.join("\n"));
const unknownNoise = jsdomNoise.filter((e) => !/Not implemented|Could not parse CSS/i.test(e));
if (unknownNoise.length) console.log(`jsdom warnings: ${unknownNoise.length} (see below)\n${unknownNoise.slice(0, 3).join("\n")}`);
const failures = log.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${log.length - failures}/${log.length} checks passed`);

await act(async () => {
  root.unmount();
});
if (process.exitCode) process.exit(process.exitCode);
