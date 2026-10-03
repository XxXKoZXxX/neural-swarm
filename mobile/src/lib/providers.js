// Streaming provider adapters.
//
// Three kinds cover every target the app supports:
//   anthropic     → Anthropic Messages API
//   openai        → any OpenAI-compatible /chat/completions (OpenAI, OpenRouter,
//                   Groq, Mistral, xAI, Ollama, LM Studio, vLLM, llama.cpp)
//   gemini        → Google generative language API
//
// Everything streams through fetch + ReadableStream so tokens land on screen as
// they are produced. Keys are read from settings on the device and are sent
// only to the provider that owns them.

const TIMEOUT_MS = 180000

/** Strip anything that looks like a key out of text before it hits the UI. */
export function redact(text, key) {
  let out = String(text ?? '')
  if (key && key.length > 8) out = out.split(key).join('[key hidden]')
  out = out.replace(/\b(sk|pk|gsk|xai|sk-or|AIza)[-_A-Za-z0-9]{12,}\b/g, '[key hidden]')
  return out
}

function humanError(err, provider, key) {
  const raw = redact(err?.message || err, key)
  if (err?.name === 'AbortError') return 'Stopped.'
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
    if (provider?.local) {
      return `Cannot reach ${provider.label}. Check the server is running and that this device is on the same network. Local servers must allow browser origins (for Ollama: OLLAMA_ORIGINS=*).`
    }
    return `Network or CORS block reaching ${provider?.label || 'the provider'}. Check your connection, then confirm the key is enabled for this provider.`
  }
  if (/\b401\b|unauthorized|invalid.*api.?key|incorrect api key/i.test(raw)) {
    return `${provider?.label || 'Provider'} rejected the key. Re-paste it in Settings → Providers.`
  }
  if (/\b402\b|insufficient|quota|billing|credit/i.test(raw)) {
    return `${provider?.label || 'Provider'} says the account is out of credit or quota.`
  }
  if (/\b403\b|forbidden|permission/i.test(raw)) {
    return `${provider?.label || 'Provider'} denied the request (403). The key may lack access to this model.`
  }
  if (/\b404\b|not found|unknown model|does not exist/i.test(raw)) {
    return `Model not available at ${provider?.label || 'provider'}. Refresh the model list in Settings.`
  }
  if (/\b429\b|rate.?limit|too many requests|overloaded/i.test(raw)) {
    return `Rate limited by ${provider?.label || 'provider'}. Wait a moment or switch model.`
  }
  if (/\b400\b|invalid_request/i.test(raw)) return `Bad request: ${raw}`
  if (/\b5\d\d\b|server error|internal/i.test(raw)) return `${provider?.label || 'Provider'} server error. Retry, or switch model.`
  return raw || 'Request failed.'
}

async function fetchWithTimeout(url, init, externalSignal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  const onAbort = () => ctrl.abort()
  if (externalSignal) {
    if (externalSignal.aborted) ctrl.abort()
    else externalSignal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener?.('abort', onAbort)
  }
}

/** Reads an SSE body and hands each parsed JSON payload to onEvent. */
async function readSSE(res, onEvent) {
  if (!res.body) throw new Error('Response had no body to stream.')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const chunks = buf.split('\n')
    buf = chunks.pop() ?? ''
    for (const line of chunks) {
      const trim = line.trim()
      if (!trim || trim.startsWith(':')) continue
      if (!trim.startsWith('data:')) continue
      const payload = trim.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        onEvent(JSON.parse(payload))
      } catch {
        /* keep-alive or partial frame — ignore */
      }
    }
  }
}

async function errorFrom(res, provider, key) {
  let detail = ''
  try {
    const text = await res.text()
    try {
      const j = JSON.parse(text)
      detail = j?.error?.message || j?.message || j?.error?.type || text
    } catch {
      detail = text
    }
  } catch {
    /* body already consumed */
  }
  const err = new Error(`${res.status} ${detail || res.statusText}`)
  err.status = res.status
  throw new Error(humanError(err, provider, key))
}

// ---------------------------------------------------------------- anthropic

async function anthropicStream({ provider, model, messages, system, maxTokens, key, signal, onToken, onUsage }) {
  const res = await fetchWithTimeout(
    `${provider.baseUrl}/v1/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Required for direct browser calls; without it Anthropic blocks CORS.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens || 8192,
        ...(system ? { system } : {}),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    },
    signal
  )

  if (!res.ok) return errorFrom(res, provider, key)

  let text = ''
  const usage = { input_tokens: 0, output_tokens: 0 }
  await readSSE(res, (ev) => {
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      text += ev.delta.text
      onToken?.(ev.delta.text)
    } else if (ev.type === 'message_start' && ev.message?.usage) {
      usage.input_tokens = ev.message.usage.input_tokens || 0
    } else if (ev.type === 'message_delta' && ev.usage) {
      usage.output_tokens = ev.usage.output_tokens || 0
    } else if (ev.type === 'error') {
      throw new Error(ev.error?.message || 'Anthropic stream error')
    }
  })
  onUsage?.(usage)
  return { text, usage }
}

// ----------------------------------------------------------- openai-compatible

async function openaiStream({ provider, model, messages, system, maxTokens, key, signal, onToken, onUsage }) {
  const base = (provider.baseUrl || '').replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const body = {
    model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m) => ({ role: m.role, content: m.content }))],
    stream: true,
    stream_options: { include_usage: true },
    ...(maxTokens ? { max_tokens: maxTokens } : {}),
  }

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        // OpenRouter asks for these; harmless everywhere else.
        'HTTP-Referer': typeof location !== 'undefined' ? location.origin : '',
        'X-Title': 'Neural Swarm',
      },
      body: JSON.stringify(body),
    },
    signal
  )

  if (!res.ok) return errorFrom(res, provider, key)

  let text = ''
  const usage = { input_tokens: 0, output_tokens: 0 }
  await readSSE(res, (ev) => {
    const delta = ev.choices?.[0]?.delta
    const piece = delta?.content ?? ev.choices?.[0]?.text ?? ''
    if (piece) {
      text += piece
      onToken?.(piece)
    }
    if (ev.usage) {
      usage.input_tokens = ev.usage.prompt_tokens ?? usage.input_tokens
      usage.output_tokens = ev.usage.completion_tokens ?? usage.output_tokens
    }
    if (ev.error) throw new Error(ev.error.message || 'Provider stream error')
  })
  onUsage?.(usage)
  return { text, usage }
}

// ---------------------------------------------------------------- gemini

async function geminiStream({ provider, model, messages, system, maxTokens, key, signal, onToken, onUsage }) {
  const url = `${provider.baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`
  const body = {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    ...(maxTokens ? { generationConfig: { maxOutputTokens: maxTokens } } : {}),
  }

  const res = await fetchWithTimeout(
    url,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    signal
  )

  if (!res.ok) return errorFrom(res, provider, key)

  let text = ''
  const usage = { input_tokens: 0, output_tokens: 0 }
  await readSSE(res, (ev) => {
    const parts = ev.candidates?.[0]?.content?.parts || []
    for (const p of parts) {
      if (p.text) {
        text += p.text
        onToken?.(p.text)
      }
    }
    if (ev.usageMetadata) {
      usage.input_tokens = ev.usageMetadata.promptTokenCount ?? usage.input_tokens
      usage.output_tokens = ev.usageMetadata.candidatesTokenCount ?? usage.output_tokens
    }
    if (ev.error) throw new Error(ev.error.message || 'Gemini stream error')
  })
  onUsage?.(usage)
  return { text, usage }
}

const ADAPTERS = { anthropic: anthropicStream, openai: openaiStream, gemini: geminiStream }

/**
 * Stream one completion.
 * Resolves to { text, usage }. Rejects with a human-readable Error on failure.
 */
export async function streamChat(opts) {
  const { provider, key } = opts
  if (!provider) throw new Error('No provider selected.')
  if (provider.requiresKey !== false && !key) {
    throw new Error(`Add your ${provider.label} API key in Settings → Providers.`)
  }
  const adapter = ADAPTERS[provider.kind]
  if (!adapter) throw new Error(`Unsupported provider kind: ${provider.kind}`)

  try {
    return await adapter(opts)
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    if (/^(Network|Model not|Rate|Add your|Anthropic|OpenAI|Google)/.test(err?.message || '')) throw err
    throw new Error(humanError(err, provider, key))
  }
}

// ------------------------------------------------------------ model discovery

async function fetchJson(url, init, signal) {
  const res = await fetchWithTimeout(url, init, signal)
  if (!res.ok) return { ok: false, status: res.status, data: null }
  try {
    return { ok: true, status: res.status, data: await res.json() }
  } catch {
    return { ok: false, status: res.status, data: null }
  }
}

/**
 * Live model list for a provider. Returns [] rather than throwing so the UI can
 * fall back to the curated catalog silently.
 */
export async function listModels({ provider, key, signal }) {
  if (!provider) return []
  const base = (provider.baseUrl || '').replace(/\/+$/, '')

  if (provider.kind === 'anthropic') {
    const { ok, data } = await fetchJson(`${base}/v1/models?limit=100`, {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    }, signal)
    if (!ok) return []
    return (data?.data || []).map((m) => m.id)
  }

  if (provider.kind === 'gemini') {
    const { ok, data } = await fetchJson(`${base}/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`, {}, signal)
    if (!ok) return []
    return (data?.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
  }

  // OpenAI-compatible. Ollama also exposes /api/tags with the full local set.
  const headers = key ? { authorization: `Bearer ${key}` } : {}
  const primary = await fetchJson(`${base}/models`, { headers }, signal)
  if (primary.ok) {
    const rows = primary.data?.data || primary.data?.models || []
    const ids = rows.map((m) => m.id || m.name).filter(Boolean)
    if (ids.length) return ids
  }
  if (provider.local) {
    const root = base.replace(/\/v1$/, '')
    const tags = await fetchJson(`${root}/api/tags`, {}, signal)
    if (tags.ok) return (tags.data?.models || []).map((m) => m.name).filter(Boolean)
  }
  return []
}
