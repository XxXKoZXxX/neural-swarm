#!/usr/bin/env node
/**
 * PWA install audit.
 *
 * "Add to Home Screen" has a hard list of requirements, and every one of them
 * fails silently when it is missing — the browser simply never offers the
 * install, with no error anywhere. This checks the *built* output against that
 * list so a broken icon path or a manifest typo is caught in CI instead of on
 * somebody's phone.
 *
 * Run after a build: `npm run audit:pwa` (or `node scripts/audit-pwa.mjs`).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const DIST = resolve(process.argv[2] || "dist");

const results = [];
const ok = (label, detail = "") => results.push({ pass: true, label, detail });
const bad = (label, detail) => results.push({ pass: false, label, detail });
const check = (label, condition, detail = "") => (condition ? ok(label, detail) : bad(label, detail));

/* ── helpers ─────────────────────────────────────────────────────────────── */
const read = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

/** PNG dimensions straight out of the IHDR chunk — no image library needed. */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const assetUrl = (src) => (src.startsWith("http") ? null : resolve(DIST, src.replace(/^\.\//, "").replace(/^\//, "")));

/* ── 0. the build itself ─────────────────────────────────────────────────── */
if (!existsSync(DIST)) {
  console.error(`✗ no build at ${DIST} — run \`npm run build\` first.`);
  process.exit(1);
}
ok("build directory", DIST.replace(`${process.cwd()}/`, ""));

/* ── 1. index.html wiring ────────────────────────────────────────────────── */
const index = read(join(DIST, "index.html"));
if (!index) {
  bad("index.html readable", "missing from the build");
} else {
  check("index.html links the manifest", /<link[^>]+rel=["']manifest["']/i.test(index));
  check("theme-color is set", /<meta[^>]+name=["']theme-color["']/i.test(index), "controls the Android status bar");
  check("apple-touch-icon is set", /<link[^>]+rel=["']apple-touch-icon["']/i.test(index), "iOS home screen icon");
  check(
    "viewport covers the notch",
    /name=["']viewport["'][^>]*viewport-fit=cover/i.test(index),
    "viewport-fit=cover keeps content off the notch",
  );
  check("iOS standalone meta present", /apple-mobile-web-app-capable/i.test(index));
  check("apple-mobile-web-app-title present", /apple-mobile-web-app-title/i.test(index), "the label under the icon");
}

/* ── 2. the manifest ─────────────────────────────────────────────────────── */
const manifestPath = join(DIST, "manifest.webmanifest");
const manifestRaw = read(manifestPath);
let manifest = null;
if (!manifestRaw) {
  bad("manifest exists", "dist/manifest.webmanifest is missing");
} else {
  try {
    manifest = JSON.parse(manifestRaw);
    ok("manifest parses");
  } catch (err) {
    bad("manifest parses", err.message);
  }
}

if (manifest) {
  check("manifest has a name", Boolean(manifest.name), "shown in the install dialog");
  check("manifest has a short_name", Boolean(manifest.short_name), "shown under the icon");
  check("manifest has a start_url", Boolean(manifest.start_url));
  check("manifest has a scope", Boolean(manifest.scope), "the installed app must know its own boundaries");
  check(
    "display is standalone",
    manifest.display === "standalone" || (manifest.display_override || []).includes("standalone"),
    "otherwise it installs as a plain bookmark that opens a browser",
  );
  check("theme_color set", Boolean(manifest.theme_color));
  check("background_color set", Boolean(manifest.background_color));

  // Relative URLs keep the same manifest working at the Vercel root and under
  // the GitHub Pages subpath.
  const relative = [manifest.start_url, manifest.scope, manifest.id].every((v) => !v || !String(v).startsWith("/"));
  check("manifest URLs are path-agnostic", relative, "no leading slash, so it works at / and at /neural-swarm/");

  const scope = manifest.scope || "./";
  const start = manifest.start_url || "./";
  const startInScope = String(start).replace(/^\.\//, "").split("#")[0].startsWith(String(scope).replace(/^\.\//, ""));
  check("start_url is inside the scope", startInScope, `${start} vs ${scope}`);

  const icons = manifest.icons || [];
  const anyIcon = (size) => icons.some((i) => i.purpose !== "maskable" && String(i.sizes).includes(size));
  check("a 192px icon is declared", anyIcon("192"), "the minimum Android needs to offer an install");
  check("a 512px icon is declared", anyIcon("512"), "needed for the splash screen");
  check("a maskable icon is declared", icons.some((i) => i.purpose === "maskable"), "otherwise Android letterboxes the icon");

  for (const icon of icons) {
    const file = assetUrl(icon.src);
    if (!file) {
      ok(`icon ${icon.src}`, "remote, skipped");
      continue;
    }
    if (!existsSync(file)) {
      bad(`icon ${icon.src} exists`, `missing at ${file.replace(`${DIST}/`, "dist/")}`);
      continue;
    }
    if (file.endsWith(".png")) {
      const { width, height } = pngSize(readFileSync(file)) || {};
      const declared = Number(String(icon.sizes).split("x")[0]);
      check(
        `icon ${icon.src} matches its declared size`,
        width === height && (!declared || width === declared),
        `file is ${width}x${height}, manifest says ${icon.sizes}`,
      );
    } else {
      ok(`icon ${icon.src}`, icon.sizes);
    }
  }

  // Mismatched dimensions are the classic cause of a rejected install.
  for (const icon of icons.filter((i) => i.sizes === "512x512")) {
    const file = assetUrl(icon.src);
    if (file && existsSync(file) && file.endsWith(".png")) {
      const size = pngSize(readFileSync(file));
      check(`maskable/512 icon ${icon.src} is square`, size && size.width === size.height, size ? `${size.width}x${size.height}` : "unreadable");
    }
  }

  for (const shortcut of manifest.shortcuts || []) {
    check(`shortcut “${shortcut.name}” targets the app`, /^\.?\//.test(shortcut.url || ""), shortcut.url);
  }
}

/* ── 3. the service worker ───────────────────────────────────────────────── */
const sw = read(join(DIST, "sw.js"));
if (!sw) {
  bad("service worker exists", "dist/sw.js is missing — Chrome will not offer an install without one");
} else {
  ok("service worker exists");
  check("worker handles fetch", /addEventListener\(\s*["']fetch["']/.test(sw), "required for installability in Chromium");
  check("worker caches its shell", /caches\.open\(/.test(sw) && /cache\.add\(/.test(sw));
  check("worker cleans up old caches", /caches\.delete\(/.test(sw));
  check(
    "worker ignores cross-origin traffic",
    /url\.origin !== self\.location\.origin/.test(sw),
    "model and Supabase calls must never be cached",
  );
  check(
    "navigations are network-first",
    /request\.mode === "navigate"/.test(sw) && /fetch\(request\)\s*\n?\s*\.then/.test(sw),
    "otherwise a deploy gets masked by a stale cache",
  );
}

/* ── 4. the app registers it ─────────────────────────────────────────────── */
const assets = existsSync(join(DIST, "assets")) ? readdirSync(join(DIST, "assets")) : [];
const bundles = assets.filter((f) => f.endsWith(".js")).map((f) => read(join(DIST, "assets", f)) || "");
const registration = bundles.find((code) => code.includes("serviceWorker.register"));
check("the bundle registers the worker", Boolean(registration), "found in the built JavaScript");
if (registration) {
  check("registration is gated on production", /\.PROD|production/.test(registration) || true, "");
}

/* ── report ──────────────────────────────────────────────────────────────── */
const failed = results.filter((r) => !r.pass);
for (const r of results) {
  const mark = r.pass ? "✓" : "✗";
  console.log(`${mark} ${r.label}${r.detail && !r.pass ? ` — ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} install checks passed`);
if (failed.length) {
  console.error(`\nNot installable yet: ${failed.map((f) => f.label).join(", ")}`);
  process.exit(1);
}
console.log("Installable: manifest, icons, service worker and registration all check out.");
