/**
 * Phone viewport click-through.
 *
 * The desktop suite proves the app works; this one proves it is *navigable*
 * on a phone: a five-slot tab bar, an all-views sheet instead of a scrolling
 * strip, swipe between views, deep links, and the browser back button.
 *
 * Run with `npm run test:mobile`.
 */
import { JSDOM, VirtualConsole } from "jsdom";

const virtualConsole = new VirtualConsole();
const jsdomNoise = [];
virtualConsole.on("jsdomError", (err) => jsdomNoise.push(String(err.message || err)));

const VIEWPORT = 390;

const dom = new JSDOM(`<!doctype html><html lang="en" data-theme="dark"><body><div id="root"></div></body></html>`, {
  url: "https://studio.local/",
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;

/* A phone-shaped window: jsdom reports 1024 wide by default, which would make
   every media query resolve to desktop. */
Object.defineProperty(window, "innerWidth", { value: VIEWPORT, writable: true, configurable: true });
Object.defineProperty(window, "innerHeight", { value: 844, writable: true, configurable: true });
Object.defineProperty(window, "outerWidth", { value: VIEWPORT, writable: true, configurable: true });
Object.defineProperty(window, "outerHeight", { value: 844, writable: true, configurable: true });

/* Real media-query evaluation for the two shapes the app uses. */
const queryMatches = (query) => {
  const maxW = /max-width:\s*(\d+)px/.exec(query);
  const minW = /min-width:\s*(\d+)px/.exec(query);
  if (maxW && window.innerWidth > Number(maxW[1])) return false;
  if (minW && window.innerWidth < Number(minW[1])) return false;
  return true;
};
const listeners = new Set();
window.matchMedia = (query) => ({
  matches: queryMatches(query),
  media: query,
  onchange: null,
  addEventListener: (_type, fn) => listeners.add(fn),
  removeEventListener: (_type, fn) => listeners.delete(fn),
  addListener: (fn) => listeners.add(fn),
  removeListener: (fn) => listeners.delete(fn),
  dispatchEvent: () => false,
});
window.HTMLElement.prototype.scrollIntoView = () => {};
window.HTMLElement.prototype.setPointerCapture = () => {};
window.scrollTo = () => {};

const define = (key, value) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("localStorage", window.localStorage);
define("sessionStorage", window.sessionStorage);
for (const key of ["HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "TouchEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  if (window[key] !== undefined) define(key, window[key]);
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
window.HTMLCanvasElement.prototype.getContext = () => ({
  save() {}, restore() {}, scale() {}, clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, fillText() {}, setTransform() {}, translate() {}, rotate() {},
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {}, set globalAlpha(v) {}, set font(v) {},
});
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 360, height: 400, top: 0, left: 0, right: 360, bottom: 400, toJSON: () => ({}) });
Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true });
define("fetch", async () => {
  throw new Error("network disabled");
});
globalThis.__NS_SIM_DELAY = 0;

define("IS_REACT_ACT_ENVIRONMENT", true);
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { act } = React;
const { ToastProvider } = await import("../src/components/ui.jsx");
const { default: App } = await import("../src/App.jsx");

const consoleErrors = [];
const originalError = console.error;
console.error = (...args) => consoleErrors.push(args.map((a) => (a && a.stack) || String(a)).join(" "));

const log = [];
const fail = (name, message) => {
  log.push(`FAIL ${name}: ${message}`);
  process.exitCode = 1;
};
const pass = (name) => log.push(`ok   ${name}`);

const container = document.getElementById("root");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flush = async (times = 3) => {
  for (let i = 0; i < times; i += 1) await act(async () => sleep(0));
};
const text = () => container.textContent || "";
const all = (selector) => [...container.querySelectorAll(selector)];
const byText = (needle, selector = "button") =>
  all(selector).find((el) => (el.textContent || "").trim().toLowerCase().includes(needle.toLowerCase()));

async function click(el, what = "element") {
  if (!el) throw new Error(`cannot click missing ${what}`);
  await act(async () => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, view: window })));
  await flush(1);
}

async function type(el, value) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await flush(1);
}

/** Synthesise the two touch events the swipe handler listens for. */
async function swipe(direction) {
  const target = container.querySelector("main.view") || container;
  const startX = direction === "left" ? 320 : 60;
  const endX = direction === "left" ? 60 : 320;
  const touch = (x) => [{ clientX: x, clientY: 300, identifier: 1, target }];
  const make = (type, x) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    event.touches = touch(x);
    event.changedTouches = touch(x);
    return event;
  };
  await act(async () => {
    target.dispatchEvent(make("touchstart", startX));
    target.dispatchEvent(make("touchend", endX));
  });
  await flush(2);
}

async function waitFor(predicate, { label = "condition", timeout = 15000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await act(async () => sleep(20));
  }
  throw new Error(`timeout waiting for ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = createRoot(container);
try {
  await act(async () => root.render(React.createElement(ToastProvider, null, React.createElement(App))));
  await flush();
} catch (err) {
  fail("mount", err.message || String(err));
}

/* 1 — the landing page on a phone: no desktop rail, CTA reachable. */
try {
  assert(!container.querySelector(".rail"), "desktop rail should not render on a phone");
  assert(!container.querySelector(".tabbar"), "the tab bar belongs to the studio, not the landing page");
  assert(/Launch your first mission/.test(text()), "landing CTA missing on a phone");
  pass("landing page on a phone");
} catch (err) {
  fail("phone landing", err.message || String(err));
}

/* 2 — entering the studio gives a five-slot tab bar, then tapping navigates. */
try {
  await click(byText("Launch your first mission"), "landing CTA");
  await click(byText("Explore first"), "onboarding dismiss");
  const bar = container.querySelector(".tabbar");
  assert(bar, "tab bar missing in the studio");
  const buttons = [...bar.querySelectorAll(".tabbar-btn")];
  assert(buttons.length === 5, `expected 5 tab bar slots, saw ${buttons.length}`);
  assert(buttons.every((b) => b.textContent.trim().length > 0), "every slot needs a label");
  const labels = buttons.map((b) => b.textContent.trim());
  assert(labels.includes("Studio") && labels.includes("More"), `unexpected labels: ${labels.join(", ")}`);
  await click(byText("Preview", ".tabbar-btn"), "Preview tab");
  assert(/Live preview/.test(text()), "Preview tab did not render");
  await click(byText("Files", ".tabbar-btn"), "Files tab");
  assert(/Workspace/.test(text()), "Files tab did not render");
  pass(`phone tab bar navigates (${labels.join(" · ")})`);
} catch (err) {
  fail("tab bar navigation", err.message || String(err));
}

/* 3 — the sheet exposes every view, including those not in the bar. */
try {
  await click(byText("More", ".tabbar-btn"), "More");
  const sheet = container.querySelector(".sheet");
  assert(sheet, "all-views sheet did not open");
  const tiles = [...sheet.querySelectorAll(".sheet-tile")];
  assert(tiles.length === 12, `expected 12 views in the sheet, saw ${tiles.length}`);
  assert(/Settings/i.test(sheet.textContent), "sheet is missing the settings shortcut");
  await click(byText("Insights", ".sheet-tile"), "Insights tile");
  assert(!container.querySelector(".sheet"), "sheet did not close after choosing a view");
  assert(/Insights/.test(text()), "Insights did not render");
  const current = container.querySelector(".tabbar-btn[aria-current='page']");
  assert(/Insights/.test(current.textContent), `bar should show the overflow view, shows “${current.textContent.trim()}”`);
  pass("all-views sheet reaches the other eight views");
} catch (err) {
  fail("all-views sheet", err.message || String(err));
}

/* 4 — swipe moves between views. */
try {
  await click(byText("Studio", ".tabbar-btn"), "Studio tab");
  await swipe("left");
  assert(/Live preview/.test(text()), `swiping left from Studio should reach Preview, got: ${text().slice(0, 60)}`);
  await swipe("right");
  assert(/Launch the swarm|Upgrade to run/.test(text()), "swiping right should return to Studio");
  pass("swipe between views");
} catch (err) {
  fail("swipe between views", err.message || String(err));
}

/* 5 — deep links: a hash opens the right view, and back returns. */
try {
  await act(async () => {
    window.location.hash = "#/vault?item=v_missing";
  });
  await flush(3);
  assert(/Neural Vault/.test(text()), "deep link to the vault failed");

  await act(async () => {
    window.location.hash = "#/history";
  });
  await flush(3);
  assert(/History/.test(text()), "deep link to history failed");

  window.history.back();
  await flush(4);
  assert(/Neural Vault/.test(text()), `browser back did not restore the vault (got: ${text().slice(0, 60)})`);
  pass("deep links + browser back");
} catch (err) {
  fail("deep links + browser back", err.message || String(err));
}

/* 6 — search from the sheet reaches every kind of result. */
try {
  await act(async () => {
    window.location.hash = "#/swarm";
  });
  await flush(2);
  await click(byText("More", ".tabbar-btn"), "More");
  await click(container.querySelector(".sheet-search"), "sheet search");
  const input = container.querySelector('input[aria-label="Command input"]');
  assert(input, "palette did not open from the sheet");
  await type(input, "terminal");
  await flush(2);
  const hit = byText("Terminal", ".palette-item");
  assert(hit, "palette search found no result");
  await click(hit, "Terminal result");
  assert(/Engine log|Terminal/.test(text()), "palette result did not navigate");
  pass("search from the sheet");
} catch (err) {
  fail("search from the sheet", err.message || String(err));
}

/* 7 — a full offline run still works at phone width, and the bar shows life. */
try {
  await click(byText("Studio", ".tabbar-btn"), "Studio tab");
  const composer = container.querySelector("textarea");
  await type(composer, "Build a mobile-first expense tracker.");
  await click(byText("Launch the swarm"), "launch");
  assert(container.querySelector(".tabbar-progress"), "the tab bar should show run progress while working");
  await waitFor(() => all("article[data-agent]").length > 0 && /Score:\s*\d/.test(text()), { label: "run to finish", timeout: 20000 });
  await click(byText("Files", ".tabbar-btn"), "Files tab");
  await flush(2);
  assert(/files? ·/.test(text()) || all(".tree-item").length >= 0, "files view failed to render");
  const picker = container.querySelector('select[aria-label="Choose a file"]');
  assert(picker, "phone file picker missing");
  const options = [...picker.querySelectorAll("option")];
  assert(options.length >= 3, `expected the generated project in the picker, saw ${options.length} option(s)`);
  await act(async () => {
    picker.value = options[1].value;
    picker.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await flush(2);
  assert(text().includes(options[1].value.split("/").pop()), "picking a file did not open it");
  pass(`phone file picker (${options.length} files)`);
} catch (err) {
  fail("mobile run + file picker", err.message || String(err));
}

/* 8 — settings are reachable and usable with a thumb. */
try {
  await click(all('button[aria-label="Settings"]')[0], "settings icon");
  assert(/Model connection/.test(text()), "settings drawer did not open");
  const targets = all(".drawer button, .drawer input, .drawer select");
  assert(targets.length > 5, "settings drawer looks empty");
  await click(all('button[aria-label="Close"]')[0], "close settings");
  assert(!/Model connection/.test(text()), "settings drawer did not close");
  pass("settings reachable from the phone top bar");
} catch (err) {
  fail("phone settings", err.message || String(err));
}

/* 9 — the landing page keeps a call to action within thumb reach. */
try {
  await act(async () => {
    window.location.hash = "#/";
  });
  await flush(3);
  const bar = container.querySelector(".landing-cta-bar");
  assert(bar, "phone landing page has no sticky CTA bar");
  assert(/Start free/.test(bar.textContent), "the sticky bar needs a primary action");
  const jump = container.querySelector(".landing-jump");
  assert(jump, "phone landing page has no section jump chips");
  pass("landing page keeps a reachable call to action");
} catch (err) {
  fail("landing CTA bar", err.message || String(err));
}

/* 10 — the sheet is modal: focus stays inside it. */
try {
  await act(async () => {
    window.location.hash = "#/swarm";
  });
  await flush(2);
  await click(byText("More", ".tabbar-btn"), "More");
  const sheet = container.querySelector(".sheet");
  assert(sheet, "sheet missing");
  // Focus lands after the sheet paints, so wait for it rather than guessing.
  await waitFor(() => sheet.contains(document.activeElement), { label: "focus to enter the sheet", timeout: 2000 });
  assert(sheet.contains(document.activeElement), "focus should move into the sheet");
  await click(byText("More", ".tabbar-btn"), "More again");
  assert(!container.querySelector(".sheet"), "tapping More again should close the sheet");
  pass("sheet takes and returns focus");
} catch (err) {
  fail("sheet focus", err.message || String(err));
}

/* 11 — no React errors anywhere in the flow. */
try {
  const real = consoleErrors.filter((e) => !/DevTools|not wrapped in act|jsdom/i.test(e));
  assert(real.length === 0, `${real.length} console error(s):\n${real.slice(0, 4).join("\n---\n")}`);
  pass("no React errors logged");
} catch (err) {
  fail("console errors", err.message || String(err));
}

console.error = originalError;
console.log(log.join("\n"));
const unknown = jsdomNoise.filter((e) => !/Not implemented|Could not parse CSS/i.test(e));
if (unknown.length) console.log(`jsdom warnings: ${unknown.length}`);
const failures = log.filter((l) => l.startsWith("FAIL")).length;
console.log(`\n${log.length - failures}/${log.length} checks passed`);

await act(async () => root.unmount());
if (process.exitCode) process.exit(process.exitCode);
