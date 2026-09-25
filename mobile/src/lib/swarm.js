// Swarm run engine: goal -> orchestrator plan -> agents -> compression -> Overseer.
//
// One provider key drives the whole chain, so the user picks the brain once and
// every agent in the run uses it.

import { AGENTS, ORCHESTRATOR_SYS, OVERSEER_SYS, buildForgeDirective, heuristicPlan, parsePlan, compressSys, detectScore } from './agents.js'
import { streamChat } from './providers.js'
import { estimateCost, modelMeta, providerById } from './catalog.js'

const COMPRESS_AFTER = 3

function resolveTarget(settings, providerId, modelId) {
  const provider = providerById(providerId || settings.defaultProvider)
  const withBase = settings.baseOverrides?.[provider.id]
    ? { ...provider, baseUrl: settings.baseOverrides[provider.id] }
    : provider
  const model = modelId || settings.defaultModel
  return { provider: withBase, model, meta: modelMeta(withBase, model, settings.discovered) }
}

async function ask({ provider, model, key, system, prompt, maxTokens, signal, onToken }) {
  let text = ''
  const usage = { input_tokens: 0, output_tokens: 0 }
  const res = await streamChat({
    provider,
    model,
    key,
    system,
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    signal,
    onToken: (t) => {
      text += t
      onToken?.(t)
    },
    onUsage: (u) => Object.assign(usage, u),
  })
  return { text: res.text ?? text, usage }
}

/**
 * Execute a swarm run.
 * onEvent receives: status | plan | compress | agent_start | agent_token |
 *                   agent_done | overseer_token | overseer | done | error
 */
export async function runSwarm({ goal, settings, providerId, modelId, agents: forcedAgents, signal, onEvent, runMeta = {} }) {
  // A listener throwing (a scroll call on an unmounted node, a bad render) must
  // never abort a multi-agent run the user is paying for.
  const emit = (e) => {
    try {
      onEvent?.(e)
    } catch {
      /* UI-side failure — keep the run alive */
    }
  }
  const { provider, model, meta } = resolveTarget(settings, providerId, modelId)
  const key = settings.keys?.[provider.id] || ''
  const maxAgents = forcedAgents?.length || settings.maxAgents || 6
  const startedAt = Date.now()
  const totals = { input_tokens: 0, output_tokens: 0 }

  // ---- 1. plan
  let plan
  if (forcedAgents?.length) {
    plan = { agents: forcedAgents, rationale: 'Agents chosen manually.', tasks: {}, source: 'manual' }
  } else {
    emit({ type: 'status', text: 'Orchestrator is planning the run…' })
    try {
      const { text, usage } = await ask({
        provider,
        model,
        key,
        system: ORCHESTRATOR_SYS,
        prompt: `GOAL: ${goal}\n\nMaximum agents allowed: ${maxAgents}. Reply with JSON only.`,
        maxTokens: 900,
        signal,
      })
      totals.input_tokens += usage.input_tokens || 0
      totals.output_tokens += usage.output_tokens || 0
      plan = parsePlan(text, maxAgents) || heuristicPlan(goal, maxAgents)
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      plan = heuristicPlan(goal, maxAgents)
      plan.note = `Planner unavailable (${err.message}) — used built-in routing.`
    }
  }
  emit({ type: 'plan', plan })

  // ---- 2. agents in sequence
  const results = []
  let rolling = ''
  const forge = buildForgeDirective(settings.forge)
  const steps = plan.agents.length

  for (let i = 0; i < steps; i++) {
    const name = plan.agents[i]
    const def = AGENTS[name]
    if (!def) continue
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const task = plan.tasks?.[name] || `Contribute your ${def.label} view toward the goal.`
    emit({ type: 'agent_start', name, index: i, total: steps })

    const system = `${forge}${def.sys}`
    const prompt = [
      `GOAL: ${goal}`,
      `YOUR TASK: ${task}`,
      rolling ? `PRIOR WORK FROM THE SWARM:\n${rolling}` : '',
      `You are agent ${i + 1} of ${steps} in this run. Produce your deliverable now.`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const agentStart = Date.now()
    try {
      const streamed = await ask({
        provider,
        model,
        key,
        system,
        prompt,
        maxTokens: settings.maxTokens || 8192,
        signal,
        onToken: (t) => emit({ type: 'agent_token', name, text: t }),
      })
      const entry = {
        name,
        out: streamed.text,
        tokens: (streamed.usage.input_tokens || 0) + (streamed.usage.output_tokens || 0),
        ms: Date.now() - agentStart,
        error: '',
      }
      totals.input_tokens += streamed.usage.input_tokens || 0
      totals.output_tokens += streamed.usage.output_tokens || 0
      results.push(entry)
      rolling += `\n\n=== ${name} ===\n${streamed.text}`
      emit({ type: 'agent_done', entry })
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      const entry = { name, out: '', tokens: 0, ms: Date.now() - agentStart, error: err.message }
      results.push(entry)
      emit({ type: 'agent_done', entry })
      // A failed agent should not kill the run — later agents still add value.
    }

    // ---- 3. compress once the chain gets long
    if (results.length >= COMPRESS_AFTER && i < steps - 1 && rolling.length > 6000) {
      emit({ type: 'status', text: 'Compressing context for downstream agents…' })
      try {
        const { text, usage } = await ask({
          provider,
          model,
          key,
          system: compressSys(goal),
          prompt: rolling,
          maxTokens: 1200,
          signal,
        })
        totals.input_tokens += usage.input_tokens || 0
        totals.output_tokens += usage.output_tokens || 0
        rolling = `[COMPRESSED BRIEF OF PRIOR AGENT OUTPUT]\n${text}`
        emit({ type: 'compress', text })
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        emit({ type: 'status', text: 'Compression skipped — carrying full context.' })
      }
    }
  }

  // ---- 4. overseer
  emit({ type: 'status', text: 'Overseer is auditing the chain…' })
  let overseer = ''
  const chain = results
    .filter((r) => r.out)
    .map((r) => `=== ${r.name} ===\n${r.out}`)
    .join('\n\n')
  try {
    const { text, usage } = await ask({
      provider,
      model,
      key,
      system: OVERSEER_SYS,
      prompt: `ORIGINAL GOAL: ${goal}\n\nFULL SWARM OUTPUT CHAIN:\n${chain.slice(0, 120000)}`,
      maxTokens: 1600,
      signal,
      onToken: (t) => emit({ type: 'overseer_token', text: t }),
    })
    overseer = text
    totals.input_tokens += usage.input_tokens || 0
    totals.output_tokens += usage.output_tokens || 0
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    overseer = `Overseer unavailable: ${err.message}`
  }

  const totalTokens = totals.input_tokens + totals.output_tokens
  const cost = estimateCost(meta, totals)
  const run = {
    id: crypto.randomUUID(),
    goal,
    providerId: provider.id,
    providerLabel: provider.label,
    model,
    modelMeta: { label: meta.label, inPrice: meta.inPrice, outPrice: meta.outPrice },
    plan,
    agents: results,
    overseer,
    score: detectScore(overseer),
    tokens: totalTokens,
    usage: totals,
    cost,
    ms: Date.now() - startedAt,
    createdAt: Date.now(),
    version: runMeta.version || 1,
    branchOf: runMeta.branchOf || null,
  }
  emit({ type: 'done', run })
  return run
}

/** Topological order for the Flow builder. Throws on a cycle. */
export function topoSort(nodes, edges) {
  const indeg = new Map(nodes.map((n) => [n.id, 0]))
  const adj = new Map(nodes.map((n) => [n.id, []]))
  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue
    adj.get(e.from).push(e.to)
    indeg.set(e.to, (indeg.get(e.to) || 0) + 1)
  }
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id)
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    for (const next of adj.get(id) || []) {
      indeg.set(next, indeg.get(next) - 1)
      if (indeg.get(next) === 0) queue.push(next)
    }
  }
  if (order.length !== nodes.length) throw new Error('This flow has a cycle — remove a connection and try again.')
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return order.map((id) => byId.get(id))
}

/** Run an explicit ordered agent list (Flow builder, or a saved template). */
export async function runFlow({ goal, nodes, edges = [], settings, providerId, modelId, signal, onEvent }) {
  const ordered = topoSort(nodes, edges)
  return runSwarm({
    goal,
    settings,
    providerId,
    modelId,
    agents: ordered.map((n) => n.agent).filter((a) => AGENTS[a]),
    signal,
    onEvent,
  })
}

export const FLOW_PRESETS = [
  { name: 'SaaS Dev Pipeline', agents: ['ARCHITECT', 'CODER', 'TESTER', 'REVIEWER'] },
  { name: 'Bug Bounty Scan', agents: ['RESEARCHER', 'DEBUGGER', 'REVIEWER'] },
  { name: 'Refactor & Polish', agents: ['ANALYST', 'REFACTORER', 'TESTER'] },
  { name: 'UI/UX Spec & Code', agents: ['DESIGNER', 'CODER', 'REVIEWER'] },
  { name: 'Full Audit', agents: ['RESEARCHER', 'DEBUGGER', 'ANALYST', 'REVIEWER'] },
]
