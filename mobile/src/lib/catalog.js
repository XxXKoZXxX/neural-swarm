// Provider + model catalog.
//
// The curated lists below are FALLBACKS ONLY. On a real device the app pulls
// the live list from each provider (see providers.js#listModels) so a model
// released tomorrow shows up without an app update. Prices are USD per 1M
// tokens and are only used for the on-device spend estimate.

export const KINDS = {
  anthropic: {
    label: 'Anthropic (native)',
    blurb: 'Claude models. Needs the browser-access header, which the app sends for you.',
  },
  openai: {
    label: 'OpenAI-compatible',
    blurb: 'Works with OpenAI, OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, LM Studio, vLLM, Ollama.',
  },
  gemini: {
    label: 'Google Gemini (native)',
    blurb: 'Gemini models via generativelanguage.googleapis.com.',
  },
}

export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    short: 'CLAUDE',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    modelsEndpoint: '/v1/models',
    models: [
      { id: 'claude-opus-5-5', label: 'Opus 5.5', ctx: 1000000, inPrice: 4, outPrice: 20, tag: 'flagship' },
      { id: 'claude-opus-5', label: 'Opus 5', ctx: 1000000, inPrice: 5, outPrice: 25, tag: 'reasoning' },
      { id: 'claude-opus-4-8', label: 'Opus 4.8', ctx: 1000000, inPrice: 5, outPrice: 25 },
      { id: 'claude-sonnet-5', label: 'Sonnet 5', ctx: 1000000, inPrice: 2, outPrice: 10, tag: 'default' },
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', ctx: 1000000, inPrice: 3, outPrice: 15 },
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5', ctx: 200000, inPrice: 1, outPrice: 5, tag: 'fast' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    short: 'GPT',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5', ctx: 1000000, inPrice: 5, outPrice: 30, tag: 'flagship' },
      { id: 'gpt-5.4', label: 'GPT-5.4', ctx: 1000000, inPrice: 2.5, outPrice: 15, tag: 'default' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', ctx: 1000000, inPrice: 0.75, outPrice: 4.5, tag: 'fast' },
      { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', ctx: 1000000, inPrice: 0.2, outPrice: 1.25, tag: 'cheap' },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', ctx: 1000000, inPrice: 1.75, outPrice: 14, tag: 'code' },
      { id: 'o3', label: 'o3', ctx: 200000, inPrice: 2, outPrice: 8, tag: 'reasoning' },
      { id: 'o4-mini', label: 'o4-mini', ctx: 200000, inPrice: 1.1, outPrice: 4.4, tag: 'reasoning' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    short: 'GEMINI',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', ctx: 1048576, inPrice: 1.5, outPrice: 9, tag: 'default' },
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', ctx: 1048576, inPrice: 1.5, outPrice: 9 },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', ctx: 1048576, inPrice: 2, outPrice: 12, tag: 'reasoning' },
      { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', ctx: 1048576, inPrice: 1.5, outPrice: 9 },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', ctx: 1048576, inPrice: 1.25, outPrice: 10 },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', ctx: 1048576, inPrice: 0.3, outPrice: 2.5, tag: 'fast' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', ctx: 1048576, inPrice: 0.1, outPrice: 0.4, tag: 'cheap' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    short: 'ROUTER',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'One key, hundreds of models from every lab. Best single-key option.',
    models: [
      { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', ctx: 1000000, inPrice: 2, outPrice: 10, tag: 'default' },
      { id: 'anthropic/claude-opus-5-5', label: 'Claude Opus 5.5', ctx: 1000000, inPrice: 4, outPrice: 20 },
      { id: 'openai/gpt-5.5', label: 'GPT-5.5', ctx: 1000000, inPrice: 5, outPrice: 30 },
      { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash', ctx: 1048576, inPrice: 1.5, outPrice: 9 },
      { id: 'x-ai/grok-4', label: 'Grok 4', ctx: 256000, inPrice: 3, outPrice: 15 },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', ctx: 128000, inPrice: 0.3, outPrice: 1.2, tag: 'cheap' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', ctx: 128000, inPrice: 0.2, outPrice: 0.6, tag: 'cheap' },
      { id: 'qwen/qwen3-235b-a22b', label: 'Qwen3 235B', ctx: 128000, inPrice: 0.2, outPrice: 0.8 },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    short: 'GROQ',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Open-weight models at extreme speed. Generous free tier.',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', ctx: 128000, inPrice: 0.59, outPrice: 0.79, tag: 'default' },
      { id: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2', ctx: 128000, inPrice: 1, outPrice: 3 },
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', ctx: 128000, inPrice: 0.15, outPrice: 0.6, tag: 'cheap' },
    ],
  },
  {
    id: 'mistral',
    label: 'Mistral',
    short: 'MISTRAL',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large', ctx: 128000, inPrice: 2, outPrice: 6, tag: 'default' },
      { id: 'mistral-small-latest', label: 'Mistral Small', ctx: 128000, inPrice: 0.2, outPrice: 0.6, tag: 'cheap' },
      { id: 'codestral-latest', label: 'Codestral', ctx: 256000, inPrice: 0.3, outPrice: 0.9, tag: 'code' },
    ],
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    short: 'GROK',
    kind: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    models: [
      { id: 'grok-4', label: 'Grok 4', ctx: 256000, inPrice: 3, outPrice: 15, tag: 'flagship' },
      { id: 'grok-3-mini', label: 'Grok 3 mini', ctx: 131072, inPrice: 0.3, outPrice: 0.5, tag: 'fast' },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (this device / LAN)',
    short: 'OLLAMA',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
    local: true,
    editableBase: true,
    note: 'Free and offline. On the phone: install Termux and run "ollama serve", or point this at your computer\'s LAN IP.',
    models: [
      { id: 'llama3.2', label: 'Llama 3.2', ctx: 131072, inPrice: 0, outPrice: 0 },
      { id: 'qwen3', label: 'Qwen3', ctx: 131072, inPrice: 0, outPrice: 0 },
      { id: 'deepseek-r1', label: 'DeepSeek R1', ctx: 131072, inPrice: 0, outPrice: 0 },
    ],
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (LAN)',
    short: 'LMSTUDIO',
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    requiresKey: false,
    local: true,
    editableBase: true,
    note: 'Point at your computer\'s LAN IP, e.g. http://192.168.1.20:1234/v1',
    models: [],
  },
  {
    id: 'custom',
    label: 'Custom endpoint',
    short: 'CUSTOM',
    kind: 'openai',
    baseUrl: '',
    requiresKey: false,
    local: true,
    editableBase: true,
    note: 'Any OpenAI-compatible server: vLLM, llama.cpp, LocalAI, your own proxy.',
    models: [],
  },
]

export const providerById = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]

export function modelsFor(provider, discovered) {
  const live = discovered?.[provider.id]
  if (Array.isArray(live) && live.length) {
    const curated = new Map((provider.models || []).map((m) => [m.id, m]))
    // Live wins on existence, curated wins on metadata (prices/labels).
    return live.map((id) => curated.get(id) || { id, label: prettyModel(id), ctx: 0, inPrice: 0, outPrice: 0, discovered: true })
  }
  return provider.models || []
}

function prettyModel(id) {
  const tail = String(id).split('/').pop()
  return tail.replace(/[-_]/g, ' ').replace(/\b([a-z])/g, (c) => c.toUpperCase())
}

export function modelMeta(provider, modelId, discovered) {
  const list = modelsFor(provider, discovered)
  const hit = list.find((m) => m.id === modelId)
  if (hit) return hit
  return { id: modelId, label: prettyModel(modelId), ctx: 0, inPrice: 0, outPrice: 0, discovered: true }
}

/** USD cost estimate from a usage report. Prices are per 1M tokens. */
export function estimateCost(meta, usage) {
  if (!meta || !usage) return 0
  const inTok = usage.input_tokens || usage.prompt_tokens || 0
  const outTok = usage.output_tokens || usage.completion_tokens || 0
  return (inTok / 1e6) * (meta.inPrice || 0) + (outTok / 1e6) * (meta.outPrice || 0)
}

export function formatCost(usd) {
  if (!usd) return '$0.0000'
  if (usd < 0.0001) return '<$0.0001'
  return `$${usd.toFixed(4)}`
}

export function formatTokens(n) {
  if (!n) return '0'
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1000000).toFixed(2)}M`
}
