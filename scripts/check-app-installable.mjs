// Installability check for the app half of the deployment.
//
//   node scripts/check-app-installable.mjs [appDir] [siteDir]
//
// Used two ways:
//   - by build-all.mjs, to decide whether /app/ is fit to ship
//   - by CI, as the hard gate
//
// Checks are driven by the manifest's own declarations, so renaming an icon
// cannot silently pass: every file the manifest promises must exist on disk.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** @returns {{label: string, pass: boolean, detail?: string}[]} */
export function inspect(appDir = 'dist/app', siteDir = 'dist') {
  const results = []
  const add = (label, pass, detail) => results.push({ label, pass: Boolean(pass), detail })

  const manifestPath = join(appDir, 'manifest.webmanifest')
  add('manifest is served under /app/', existsSync(manifestPath))
  if (!existsSync(manifestPath)) return results

  let m = null
  try {
    m = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    add('manifest is valid JSON', false, err.message)
    return results
  }
  add('manifest is valid JSON', true)

  add('name', Boolean(m.name))
  add('short_name', Boolean(m.short_name))
  add('start_url', Boolean(m.start_url))
  add('display standalone', m.display === 'standalone')
  add('service worker', existsSync(join(appDir, 'sw.js')))
  add('app SPA fallback (404.html)', existsSync(join(appDir, '404.html')))

  const icons = Array.isArray(m.icons) ? m.icons : []
  add('icons declared', icons.length > 0)
  add('192x192 icon declared', icons.some((i) => i.sizes === '192x192'))
  add('512x512 icon declared', icons.some((i) => i.sizes === '512x512'))
  add('maskable icon declared', icons.some((i) => i.purpose === 'maskable'))

  // The important one: every declared icon must actually exist.
  for (const icon of icons) {
    add(`icon file exists: ${icon.src}`, existsSync(join(appDir, icon.src)))
  }

  // The site must survive the app being added alongside it.
  add('site entry intact', existsSync(join(siteDir, 'index.html')))
  add('site SPA fallback', existsSync(join(siteDir, '404.html')))

  return results
}

export function isInstallable(appDir, siteDir) {
  return inspect(appDir, siteDir).every((r) => r.pass)
}

// ---- CLI -------------------------------------------------------------------
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (invokedDirectly) {
  const appDir = process.argv[2] || 'dist/app'
  const siteDir = process.argv[3] || 'dist'
  const results = inspect(appDir, siteDir)
  for (const r of results) {
    console.log(`  ${r.pass ? 'ok  ' : 'FAIL'}  ${r.label}${r.detail ? ` — ${r.detail}` : ''}`)
  }
  const failed = results.filter((r) => !r.pass)
  if (failed.length) {
    console.error(`\nApp is not installable at /app/: ${failed.length} check(s) failed.`)
    process.exit(1)
  }
  console.log('\nApp is installable at /app/.')
}
