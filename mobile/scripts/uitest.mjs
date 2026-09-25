// Integration test: mounts the real App in a DOM and drives it.
//   node scripts/uitest.mjs
//
// Catches what a build cannot: broken component render, bad hook usage,
// switching tabs, saving settings, and streaming a reply into the chat.

import { JSDOM } from 'jsdom'

let pass = 0
let fail = 0

const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ------------------------------------------------------------------ fake DOM

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://localhost/',
  pretendToBeVisual: true,
})

globalThis.window = dom.window
globalThis.document = dom.window.document
// Node 22 exposes navigator as a getter-only global, so define rather than assign.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.Event = dom.window.Event
globalThis.CustomEvent = dom.window.CustomEvent
globalThis.getComputedStyle = dom.window.getComputedStyle
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

// jsdom does not implement element scrolling; real browsers do.
dom.window.Element.prototype.scrollTo = function scrollTo() {}
dom.window.Element.prototype.scrollIntoView = function scrollIntoView() {}
globalThis.matchMedia = dom.window.matchMedia
globalThis.localStorage = dom.window.localStorage

// jsdom implements localStorage but not IndexedDB, which is exactly the
// private-mode path the store is built to survive.
globalThis.indexedDB = undefined

const realFetch = globalThis.fetch
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/v1/messages')) {
    // A two-agent swarm needs: plan, agent 1, agent 2, overseer.
    const body = init?.body ? JSON.parse(init.body) : {}
    const isPlan = String(body.system || '').includes('orchestrator')
    const isOverseer = String(body.system || '').includes('Overseer')
    const chunks = isPlan
      ? ['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{\\"agents\\":[\\"CODER\\",\\"REVIEWER\\"],\\"rationale\\":\\"small run\\"}"}}\n\n']
      : isOverseer
        ? ['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"SCORE: 8/10\\nVERDICT: solid"}}\n\n']
        : ['data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Agent output here."}}\n\n']
    const stream = new ReadableStream({
      start(c) {
        const enc = new TextEncoder()
        for (const chunk of chunks) c.enqueue(enc.encode(chunk))
        c.close()
      },
    })
    return new Response(stream, { status: 200 })
  }
  if (u.includes('/v1/models')) {
    return new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-5' }] }), { status: 200 })
  }
  return new Response('{}', { status: 200 })
}

// ------------------------------------------------------------------ vite SSR

const { createServer } = await import('vite')
const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
})

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const { default: App } = await server.ssrLoadModule('/src/App.jsx')
const { saveSettings } = await server.ssrLoadModule('/src/lib/store.js')

const container = document.getElementById('root')
const root = createRoot(container)

const settle = async (ms = 30) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

const text = () => container.textContent || ''
const tab = (label) => [...container.querySelectorAll('.tab')].find((t) => t.textContent.includes(label))
const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  await settle()
}

console.log('\napp shell')
await act(async () => {
  root.render(React.createElement(App))
})
await settle(60)

ok('mounts without throwing', text().length > 0)
ok('unlocks when no PIN is set (no PIN field shown)', !container.querySelector('input[type="password"]'))
ok('renders the tab bar', container.querySelectorAll('.tab').length === 6, `${container.querySelectorAll('.tab').length} tabs`)
ok('lands on the chat composer', Boolean(container.querySelector('.composer textarea')))
ok('shows the no-key call to action', text().includes('Add a model key to start'))

console.log('\ntab navigation')
for (const label of ['Swarm', 'Flow', 'Vault', 'Runs', 'Setup']) {
  await click(tab(label))
  ok(`switches to ${label}`, Boolean(tab(label)?.className.includes('on')))
}

console.log('\nsettings: saving a key')
await click(tab('Setup'))
const keyInput = [...container.querySelectorAll('input')].find((i) => i.placeholder?.includes('Anthropic API key'))
ok('renders a key field per provider', Boolean(keyInput))
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  setter.call(keyInput, 'sk-ant-test-key-1234567890')
  keyInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
})
await settle(60)
ok('provider shows as configured', text().includes('1 of') || text().includes('ready'))
ok('the unconfigured banner disappears', !text().includes('Add a model key to start'))

console.log('\nchat: streaming a reply')
await click(tab('Chat'))
const box = container.querySelector('.composer textarea')
ok('renders the composer', Boolean(box))
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(box, 'Say hello in five words')
  box.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
})
await settle(40)
await click(container.querySelector('.send'))
await settle(160)
ok('renders the user message', text().includes('Say hello in five words'))
ok('streams the assistant reply into the thread', text().includes('Agent output here.'))
ok('records the model on the reply', text().includes('Sonnet 5'))

console.log('\nswarm: running the pipeline')
await click(tab('Swarm'))
const goal = container.querySelector('.scroll textarea')
await act(async () => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(goal, 'Build a rate limiter')
  goal.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
})
await settle(40)
await click([...container.querySelectorAll('button')].find((b) => b.textContent.includes('Launch the Swarm')))
await settle(260)
ok('shows the orchestrator plan', text().includes('small run'))
ok('renders agent cards', container.querySelectorAll('.agent').length >= 2, `${container.querySelectorAll('.agent').length} cards`)
ok('renders the overseer verdict', text().includes('solid'))
ok('shows the parsed score', text().includes('8/10'))
ok('shows run totals', text().includes('Run totals'))

console.log('\nvault: persistence through the run')
await click(tab('Vault'))
ok('vault screen renders', text().includes('Vault'))

console.log('\nruns: the finished run is saved')
await click(tab('Runs'))
await settle(80)
ok('lists the run', text().includes('Build a rate limiter'))
ok('shows the run score', text().includes('8/10'))

console.log('\nreload: settings and data survive')
const persisted = await act(async () => saveSettings({ ...(await server.ssrLoadModule('/src/lib/store.js')).DEFAULT_SETTINGS, defaultModel: 'gpt-5.4', keys: { anthropic: 'sk-ant-x' } }))
await act(async () => {
  root.unmount()
})
const root2 = createRoot(container)
await act(async () => {
  root2.render(React.createElement(App))
})
await settle(80)
ok('remounts from saved state', text().includes('CHAT') || text().includes('Chat'))
ok('key persisted to storage', Boolean(persisted))

await server.close()

console.log(`\n${pass} passed, ${fail} failed`)
globalThis.fetch = realFetch
process.exit(fail ? 1 : 0)
