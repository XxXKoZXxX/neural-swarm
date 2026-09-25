// Vercel build entry point.
//
//   node scripts/build-all.mjs
//
// Produces one deployable tree:
//   dist/        the website  (unchanged behaviour)
//   dist/app/    the Neural Swarm phone app, served at /app/
//
// The app is built with the base path rewrite so its assets, manifest, icons and
// service worker all resolve under /app/.
//
// The site build stays fatal — if it breaks, the deploy must fail. The app build
// is deliberately NOT fatal: a broken app should never be able to take the
// website down with it. The app has its own gate in .github/workflows/app-deploy.yml,
// which fails loudly on test or installability problems.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const mobile = join(repo, 'mobile')
const siteOut = join(repo, 'dist')
const appOut = join(mobile, 'dist')

const viteBin = join(repo, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')

const banner = (text) => console.log(`\n\u2500\u2500 ${text} ${'\u2500'.repeat(Math.max(0, 46 - text.length))}`)

function runVite(cwd, env = {}) {
  const res = spawnSync(viteBin, ['build'], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  return res.status === 0
}

// 1. Website ---------------------------------------------------------------
banner('site')
if (!existsSync(viteBin)) {
  console.error(`vite not found at ${viteBin}. Run npm ci first.`)
  process.exit(1)
}
if (!runVite(repo)) {
  console.error('\nSite build failed. Aborting so the previous deployment stays live.')
  process.exit(1)
}

// 2. App -------------------------------------------------------------------
banner('app')
let appBuilt = false
try {
  rmSync(appOut, { recursive: true, force: true })
  appBuilt = runVite(mobile, { APP_BASE: '/app/' })
} catch (err) {
  console.error('App build threw:', err?.message || err)
  appBuilt = false
}

if (appBuilt) {
  // 3. Assemble -------------------------------------------------------------
  banner('assemble')
  const target = join(siteOut, 'app')
  mkdirSync(target, { recursive: true })
  cpSync(appOut, target, { recursive: true })

  // SPA fallbacks: the site at the root, the app under /app/.
  cpSync(join(siteOut, 'index.html'), join(siteOut, '404.html'))
  cpSync(join(target, 'index.html'), join(target, '404.html'))

  // Fail the app half only, never the site half, if the manifest is broken.
  const manifest = JSON.parse(readFileSync(join(target, 'manifest.webmanifest'), 'utf8'))
  const sizes = (manifest.icons || []).map((i) => i.sizes)
  const missing = [
    ['192px icon', sizes.includes('192x192')],
    ['512px icon', sizes.includes('512x512')],
    ['maskable icon', (manifest.icons || []).some((i) => i.purpose === 'maskable')],
    ['service worker', existsSync(join(target, 'sw.js'))],
    ['start_url', Boolean(manifest.start_url)],
    ['display standalone', manifest.display === 'standalone'],
  ].filter(([, pass]) => !pass)

  if (missing.length) {
    console.warn(`App is missing installability requirements: ${missing.map(([n]) => n).join(', ')}`)
    console.warn('Removing /app/ from this deployment.')
    rmSync(target, { recursive: true, force: true })
    appBuilt = false
  } else {
    console.log('App assembled at /app/ and installable.')
  }
}

if (!appBuilt) {
  console.warn('\n*** The app was NOT included in this deployment. The site is unaffected. ***')
  console.warn('*** Check the "App CI" workflow for the failure. ***')
  // Vercel must never fail because the app broke — a down website is worse than
  // a missing app tab. CI sets APP_STRICT so the same build does fail there,
  // which is what actually blocks a broken app from reaching production.
  if (process.env.APP_STRICT) {
    console.error('\nAPP_STRICT is set: failing because the app is not in the output.')
    process.exit(1)
  }
}
