// Self-test for the app's core logic. Runs in plain Node — no browser needed.
//   node scripts/selftest.mjs
//
// Verifies the three streaming adapters against mocked SSE responses, plus the
// planner, forge, diff, markdown and storage-fallback paths.

import { renderToStaticMarkup } from 'react-dom/server'

let pass = 0
let fail = 0
const failures = []

function ok(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ---------------------------------------------------------------- test doubles

// Minimal localStorage so store.js exercises its IndexedDB-less fallback.
const lsData = new Map()
globalThis.localStorage = {
  getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
  setItem: (k, v) => lsData.set(k, String(v)),
  removeItem: (k) => lsData.delete(k),
}
globalThis.indexedDB = undefined

function sseResponse(chunks, { status = 200, statusText = 'OK' } = {}) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
  return new Response(stream, { status, statusText })
}

const jsonResponse = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })

let lastRequest = null

function mockFetch(handler) {
  globalThis.fetch = async (url, init = {}) => {
    lastRequest = { url: String(url), init, body: init.body ? JSON.parse(init.body) : null }
    return handler(String(url), init)
  }
}

// ------------------------------------------------------------------- imports

const { streamChat, listModels, redact } = await import('../src/lib/providers.js')
const { providerById, modelsFor, estimateCost, formatCost, formatTokens } = await import('../src/lib/catalog.js')
const { heuristicPlan, parsePlan, buildForgeDirective, detectScore, AGENT_KEYS, FORGE_COUNT, PERSONALITIES, TONES, CONSTRAINTS } = await import('../src/lib/agents.js')
const { topoSort, FLOW_PRESETS } = await import('../src/lib/swarm.js')
const { renderMarkdown, summarize } = await import('../src/lib/markdown.js')
const { diffLines, compactDiff, diffStats } = await import('../src/lib/diff.js')
const { store, loadSettings, saveSettings, DEFAULT_SETTINGS } = await import('../src/lib/store.js')

// ------------------------------------------------------------------ providers

console.log('\nproviders: anthropic')
{
  mockFetch(() =>
    sseResponse([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12,"output_tokens":0}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n',
    ])
  )

  const seen = []
  let usage = null
  const res = await streamChat({
    provider: providerById('anthropic'),
    model: 'claude-sonnet-5',
    key: 'sk-ant-testkey1234567890',
    system: 'be brief',
    messages: [{ role: 'user', content: 'hi' }],
    onToken: (t) => seen.push(t),
    onUsage: (u) => (usage = u),
  })

  eq('assembles streamed text', res.text, 'Hello world')
  eq('emits tokens incrementally', seen.join('|'), 'Hello| world')
  eq('reads input usage', usage.input_tokens, 12)
  eq('reads output usage', usage.output_tokens, 7)
  eq('posts to /v1/messages', lastRequest.url, 'https://api.anthropic.com/v1/messages')
  eq('sends browser-access header', lastRequest.init.headers['anthropic-dangerous-direct-browser-access'], 'true')
  eq('sends api version', lastRequest.init.headers['anthropic-version'], '2023-06-01')
  eq('passes system prompt', lastRequest.body.system, 'be brief')
  eq('requests streaming', lastRequest.body.stream, true)
}

console.log('\nproviders: openai-compatible (covers OpenAI, OpenRouter, Groq, Ollama, LM Studio)')
{
  mockFetch(() =>
    sseResponse([
      'data: {"choices":[{"delta":{"content":"Par"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"tial"}}]}\n\n',
      ': keep-alive\n\n',
      'data: {"choices":[{"delta":{"content":" done"}}],"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\n',
      'data: [DONE]\n\n',
    ])
  )

  // Tolerate a model id we never curated — this is the "any model, any time" path.
  const res = await streamChat({
    provider: providerById('openrouter'),
    model: 'some-lab/brand-new-model-2026',
    key: 'sk-or-testkey1234567890',
    messages: [{ role: 'user', content: 'hi' }],
    system: 'sys',
  })

  eq('assembles openai deltas', res.text, 'Partial done')
  eq('reads usage from final chunk', res.usage.output_tokens, 4)
  eq('hits chat/completions', lastRequest.url, 'https://openrouter.ai/api/v1/chat/completions')
  eq('uses bearer auth', lastRequest.init.headers.authorization, 'Bearer sk-or-testkey1234567890')
  eq('prepends system message', lastRequest.body.messages[0].role, 'system')
  eq('sends uncurated model id verbatim', lastRequest.body.model, 'some-lab/brand-new-model-2026')
}

console.log('\nproviders: gemini')
{
  mockFetch(() =>
    sseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"Gem"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"ini"}]}}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2}}\n\n',
    ])
  )

  const res = await streamChat({
    provider: providerById('gemini'),
    model: 'gemini-3.8-flash',
    key: 'AIzaTestKey1234567890',
    messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'go' }],
    system: 'sys',
  })

  eq('assembles gemini parts', res.text, 'Gemini')
  eq('reads gemini usage', res.usage.input_tokens, 5)
  ok('targets streamGenerateContent', lastRequest.url.includes(':streamGenerateContent?alt=sse'))
  ok('url-encodes model', lastRequest.url.includes('/models/gemini-3.8-flash:'))
  eq('maps assistant role to model', lastRequest.body.contents[1].role, 'model')
  eq('sends systemInstruction', lastRequest.body.systemInstruction.parts[0].text, 'sys')
}

console.log('\nproviders: failure handling')
{
  mockFetch(() => jsonResponse({ error: { message: 'Incorrect API key provided: sk-abc123456789012345' } }, 401))
  let msg = ''
  try {
    await streamChat({ provider: providerById('openai'), model: 'gpt-5.4', key: 'sk-abc123456789012345', messages: [] })
  } catch (e) {
    msg = e.message
  }
  ok('turns 401 into an actionable message', msg.includes('rejected the key'), msg)
  ok('never echoes the key back', !msg.includes('sk-abc123456789012345'), msg)

  mockFetch(() => jsonResponse({ error: { message: 'model not found' } }, 404))
  try {
    await streamChat({ provider: providerById('openai'), model: 'nope', key: 'k'.repeat(20), messages: [] })
  } catch (e) {
    msg = e.message
  }
  ok('explains a missing model', msg.includes('Model not available'), msg)

  let threw = ''
  try {
    await streamChat({ provider: providerById('anthropic'), model: 'claude-sonnet-5', key: '', messages: [] })
  } catch (e) {
    threw = e.message
  }
  ok('blocks a missing key before calling out', threw.includes('Add your Anthropic API key'), threw)

  eq('redacts key-shaped strings', redact('token sk-abcdefghijklmnop', 'sk-abcdefghijklmnop'), 'token [key hidden]')
}

console.log('\nproviders: model discovery')
{
  mockFetch(() => jsonResponse({ object: 'list', data: [{ id: 'claude-opus-5-5' }, { id: 'claude-sonnet-5' }] }))
  const ids = await listModels({ provider: providerById('anthropic'), key: 'k'.repeat(20) })
  eq('discovers anthropic models', ids.join(','), 'claude-opus-5-5,claude-sonnet-5')

  mockFetch(() => jsonResponse({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed-001', supportedGenerationMethods: ['embedContent'] }] }))
  const g = await listModels({ provider: providerById('gemini'), key: 'k'.repeat(20) })
  eq('filters gemini to generateContent models', g.join(','), 'gemini-3.8-flash')

  // Ollama answers on /api/tags, not the OpenAI /models route.
  mockFetch((url) => (url.includes('/api/tags') ? jsonResponse({ models: [{ name: 'qwen3:8b' }] }) : jsonResponse({}, 404)))
  const local = await listModels({ provider: providerById('ollama'), key: '' })
  eq('falls back to ollama /api/tags', local.join(','), 'qwen3:8b')

  mockFetch(() => jsonResponse({ error: 'nope' }, 500))
  const dead = await listModels({ provider: providerById('groq'), key: 'k'.repeat(20) })
  eq('returns empty on a dead provider', dead.length, 0)
}

// --------------------------------------------------------------------- catalog

console.log('\ncatalog')
{
  eq('all 18 personalities present', Object.keys(PERSONALITIES).length, 18)
  eq('all 12 tones present', Object.keys(TONES).length, 12)
  eq('all 15 constraints present', Object.keys(CONSTRAINTS).length, 15)
  eq('prompt forge totals 3,240', FORGE_COUNT, 3240)
  eq('ten agents defined', AGENT_KEYS.length, 10)

  const meta = { inPrice: 3, outPrice: 15 }
  ok('cost math matches provider pricing', Math.abs(estimateCost(meta, { input_tokens: 1000, output_tokens: 2000 }) - 0.033) < 1e-9)
  eq('formats small costs', formatCost(0.033), '$0.0330')
  eq('formats token counts', formatTokens(1500), '1.5k')

  const local = providerById('ollama')
  eq('local provider needs no key', local.requiresKey, false)

  const picked = modelsFor(providerById('openrouter'), { openrouter: ['anthropic/claude-sonnet-5', 'brand/new-thing'] })
  eq('live list overrides curated list', picked.length, 2)
  eq('keeps curated label for a known id', picked[0].label, 'Claude Sonnet 5')
  ok('labels an unknown id readably', picked[1].label === 'New Thing', picked[1].label)
}

// ----------------------------------------------------------------------- agents

console.log('\nagents and planning')
{
  const p = heuristicPlan('Find security vulnerabilities in this repo', 6)
  eq('security goal routes to the security chain', p.agents.join(','), 'RESEARCHER,DEBUGGER,REVIEWER')

  const b = heuristicPlan('Build me a payments API', 6)
  eq('build goal includes an architect and a coder', b.agents.join(','), 'ARCHITECT,CODER,TESTER,REVIEWER')

  const capped = heuristicPlan('Build and design a security audited app', 2)
  ok('respects the agent cap', capped.agents.length <= 2)

  const parsed = parsePlan('Sure! {"agents":["ARCHITECT","CODER","REVIEWER"],"rationale":"build it","tasks":{"CODER":"write it"}} Hope that helps!', 6)
  eq('parses a plan out of surrounding prose', parsed.agents.join(','), 'ARCHITECT,CODER,REVIEWER')
  eq('parses the task map', parsed.tasks.CODER, 'write it')
  eq('rejects an unknown agent', parsePlan('{"agents":["HACKER"]}'), null)
  eq('returns null on garbage', parsePlan('no json here'), null)

  const d = buildForgeDirective({ personality: 'Dark Detective', tone: 'Noir Monologue', constraints: ['Max 80 words'] })
  ok('forge directive names the personality', d.includes('Dark Detective'))
  ok('forge directive lists constraints', d.includes('Max 80 words'))
  eq('empty forge yields nothing', buildForgeDirective({ personality: '', tone: '', constraints: [] }), '')

  eq('reads the overseer score', detectScore('SCORE: 7/10\nVERDICT: ok'), 7)

  // topological ordering used by the Flow builder
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const order = topoSort(nodes, [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }])
  eq('sorts a linear chain', order.map((n) => n.id).join(''), 'abc')

  let cycle = ''
  try {
    topoSort([{ id: 'a' }, { id: 'b' }], [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }])
  } catch (e) {
    cycle = e.message
  }
  ok('detects a cycle', cycle.includes('cycle'), cycle)
}

// ----------------------------------------------------------------------- diff

console.log('\ndiff and markdown')
{
  const rows = diffLines('a\nb\nc', 'a\nB\nc')
  eq('finds one removal', diffStats(rows).removed, 1)
  eq('finds one addition', diffStats(rows).added, 1)

  const long = Array.from({ length: 60 }, (_, i) => `line ${i}`)
  const changed = [...long]
  changed[30] = 'CHANGED'
  const compacted = compactDiff(diffLines(long.join('\n'), changed.join('\n')), 2)
  ok('compacts unchanged regions', compacted.length < 20, `kept ${compacted.length} of 61`)
  ok('compaction keeps the change', compacted.some((r) => r.line === 'CHANGED'))
  ok('compaction marks gaps', compacted.some((r) => r.type === 'gap'))

  const html = renderToStaticMarkup(renderMarkdown('# Title\n\nSome **bold** and `code`.\n\n- one\n- two\n\n```js\nconst x = 1\n```'))
  ok('renders headings', html.includes('<h3'))
  ok('renders bold', html.includes('<strong>bold</strong>'))
  ok('renders inline code', html.includes('md-code'))
  ok('renders list items', html.includes('<li'))
  ok('renders fenced code with language', html.includes('md-lang') && html.includes('const x = 1'))

  const evil = renderToStaticMarkup(renderMarkdown('[click](javascript:alert(1)) and <img src=x onerror=alert(1)>'))
  ok('strips javascript: links', !evil.includes('javascript:'))
  ok('escapes raw html from model output', !evil.includes('<img'), evil)

  eq('summarizes a title', summarize('Build me a **payments** API now'), 'Build me a payments API now')
  ok('truncates long titles', summarize('x'.repeat(200)).length <= 44)
}

// -------------------------------------------------------------------- storage

console.log('\nstorage fallback (no IndexedDB, e.g. private mode)')
{
  await store.put('vault', { id: 'v1', title: 'decision', body: 'use RLS' })
  const got = await store.get('vault', 'v1')
  eq('writes and reads back', got.title, 'decision')

  await store.put('vault', { id: 'v2', title: 'second', body: 'x' })
  const all = await store.all('vault')
  eq('lists all rows', all.length, 2)

  await store.del('vault', 'v1')
  eq('deletes a row', (await store.all('vault')).length, 1)

  const settings = await loadSettings()
  eq('returns defaults when empty', settings.defaultModel, 'claude-sonnet-5')

  await saveSettings({ ...settings, defaultModel: 'gpt-5.4', keys: { openai: 'sk-test' } })
  const reloaded = await loadSettings()
  eq('round-trips a setting', reloaded.defaultModel, 'gpt-5.4')
  eq('round-trips keys', reloaded.keys.openai, 'sk-test')
  eq('keeps defaults for unset fields', reloaded.maxAgents, DEFAULT_SETTINGS.maxAgents)
}

// ---------------------------------------------------------------------- report

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
