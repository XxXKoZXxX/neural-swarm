// Swarm — give a goal, the orchestrator picks agents and runs them in sequence.

import { useCallback, useEffect, useRef, useState } from 'react'
import AgentCard from '../components/AgentCard.jsx'
import ModelPicker, { ModelPill } from '../components/ModelPicker.jsx'
import { Sheet, haptic, copyText, downloadFile } from '../components/ui.jsx'
import { AGENT_KEYS, AGENTS, PERSONALITIES, TONES, CONSTRAINTS, FORGE_COUNT, buildForgeDirective } from '../lib/agents.js'
import { providerById, modelMeta, formatCost, formatTokens } from '../lib/catalog.js'
import { runSwarm } from '../lib/swarm.js'
import { saveRun, saveVaultItem, listVault } from '../lib/store.js'
import { renderMarkdown } from '../lib/markdown.js'

const EMPTY = { agents: [], overseer: '', plan: null }

export default function SwarmScreen({ settings, setSettings, toast, refreshModels, refreshing, seed, clearSeed, onOpenRun }) {
  const [goal, setGoal] = useState('')
  const [manual, setManual] = useState(false)
  const [picked, setPicked] = useState([])
  const [lineage, setLineage] = useState({ branchOf: null, version: 1 })
  const [run, setRun] = useState(EMPTY)
  const [phase, setPhase] = useState('idle')
  const [status, setStatus] = useState('')
  const [cost, setCost] = useState({ tokens: 0, cost: 0 })
  const [picker, setPicker] = useState(false)
  const [forge, setForge] = useState(false)
  const [vaultPick, setVaultPick] = useState(false)
  const [vaultItems, setVaultItems] = useState([])
  const [localForge, setLocalForge] = useState(settings.forge)

  const abortRef = useRef(null)
  const liveRef = useRef({})
  const scrollRef = useRef(null)
  const rafRef = useRef(0)

  const provider = providerById(settings.defaultProvider)
  const meta = modelMeta(provider, settings.defaultModel, settings.discovered)
  const busy = phase === 'running'

  useEffect(() => {
    setLocalForge(settings.forge)
  }, [settings.forge])

  useEffect(() => {
    if (!seed) return
    if (seed.goal) setGoal(seed.goal)
    if (seed.agents?.length) {
      setManual(true)
      setPicked(seed.agents)
    }
    setLineage({ branchOf: seed.branchOf || null, version: seed.version || 1 })
    clearSeed?.()
  }, [seed, clearSeed])

  // Batch on-screen token writes to one paint per frame.
  const flush = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const pending = liveRef.current
      liveRef.current = {}
      if (!Object.keys(pending).length) return
      setRun((prev) => ({
        ...prev,
        agents: prev.agents.map((a) => (pending[a.name] !== undefined ? { ...a, out: a.out + pending[a.name] } : a)),
      }))
    })
  }, [])

  const launch = async () => {
    const text = goal.trim()
    if (!text) return
    if (busy) return

    setPhase('running')
    setRun(EMPTY)
    setCost({ tokens: 0, cost: 0 })
    setStatus('Starting…')
    haptic(18)

    const ctrl = new AbortController()
    abortRef.current = ctrl
    let tokens = 0

    try {
      await runSwarm({
        goal: text,
        settings: { ...settings, forge: localForge },
        providerId: settings.defaultProvider,
        modelId: settings.defaultModel,
        agents: manual && picked.length ? picked : null,
        signal: ctrl.signal,
        runMeta: lineage,
        onEvent: (ev) => {
          if (ev.type === 'status') setStatus(ev.text)
          if (ev.type === 'plan') setRun((prev) => ({ ...prev, plan: ev.plan }))
          if (ev.type === 'agent_start') {
            liveRef.current = {}
            setStatus(`${AGENTS[ev.name]?.label || ev.name} working…`)
            setRun((prev) => ({
              ...prev,
              agents: [...prev.agents, { name: ev.name, out: '', running: true, index: ev.index }],
            }))
            scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
          }
          if (ev.type === 'agent_token') {
            liveRef.current[ev.name] = (liveRef.current[ev.name] || '') + ev.text
            flush()
          }
          if (ev.type === 'agent_done') {
            tokens += ev.entry.tokens || 0
            setCost((c) => ({ ...c, tokens }))
            setRun((prev) => ({
              ...prev,
              agents: prev.agents.map((a) =>
                a.name === ev.entry.name ? { ...a, out: ev.entry.out, error: ev.entry.error, running: false, tokens: ev.entry.tokens, ms: ev.entry.ms } : a
              ),
            }))
          }
          if (ev.type === 'overseer_token') {
            setRun((prev) => ({ ...prev, overseer: prev.overseer + ev.text }))
          }
          if (ev.type === 'done') {
            setRun({ agents: ev.run.agents, overseer: ev.run.overseer, plan: ev.run.plan })
            setCost({ tokens: ev.run.tokens, cost: ev.run.cost })
            saveRun(ev.run)
            navigator.vibrate?.(30)
          }
        },
      })
      setPhase('done')
      setStatus('Run complete.')
    } catch (err) {
      if (err?.name === 'AbortError') {
        setStatus('Stopped.')
        setPhase('idle')
      } else {
        setStatus(`Failed: ${err.message}`)
        setPhase('error')
        toast(err.message, 'error')
      }
    } finally {
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    haptic(20)
  }

  const saveToVault = async (title, body, tags) => {
    await saveVaultItem({
      id: crypto.randomUUID(),
      title,
      body,
      tags,
      kind: 'swarm',
      createdAt: Date.now(),
    })
    toast('Saved to Vault')
  }

  const dispatchScript = (lang) => {
    const p = provider
    const key = settings.keys?.[p.id] || (p.requiresKey === false ? '' : 'YOUR_API_KEY')
    const goalText = goal.trim()
    const systemLine = run.plan?.agents?.length
      ? `Run these agents in order: ${run.plan.agents.join(', ')}.`
      : 'Plan and execute this goal.'

    if (lang === 'curl') {
      if (p.kind === 'anthropic') {
        return `curl -N ${p.baseUrl}/v1/messages \\\n  -H "x-api-key: ${key}" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "content-type: application/json" \\\n  -d '${JSON.stringify({
          model: meta.id,
          max_tokens: settings.maxTokens,
          stream: true,
          system: systemLine,
          messages: [{ role: 'user', content: goalText }],
        })}'`
      }
      if (p.kind === 'gemini') {
        return `curl -N "${p.baseUrl}/v1beta/models/${meta.id}:streamGenerateContent?alt=sse&key=${key}" \\\n  -H "content-type: application/json" \\\n  -d '${JSON.stringify({ contents: [{ role: 'user', parts: [{ text: goalText }] }] })}'`
      }
      return `curl -N ${p.baseUrl}/chat/completions \\\n  -H "authorization: Bearer ${key}" \\\n  -H "content-type: application/json" \\\n  -d '${JSON.stringify({
        model: meta.id,
        stream: true,
        messages: [{ role: 'system', content: systemLine }, { role: 'user', content: goalText }],
      })}'`
    }

    if (lang === 'node') {
      const body =
        p.kind === 'anthropic'
          ? `{ model: ${JSON.stringify(meta.id)}, max_tokens: ${settings.maxTokens}, stream: true, system: ${JSON.stringify(systemLine)}, messages: [{ role: 'user', content: goal }] }`
          : p.kind === 'gemini'
            ? `{ contents: [{ role: 'user', parts: [{ text: goal }] }] }`
            : `{ model: ${JSON.stringify(meta.id)}, stream: true, messages: [{ role: 'system', content: ${JSON.stringify(systemLine)} }, { role: 'user', content: goal }] }`
      const url =
        p.kind === 'anthropic'
          ? `${p.baseUrl}/v1/messages`
          : p.kind === 'gemini'
            ? `${p.baseUrl}/v1beta/models/${meta.id}:streamGenerateContent?alt=sse&key=${key}`
            : `${p.baseUrl}/chat/completions`
      const headers =
        p.kind === 'anthropic'
          ? `{ 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }`
          : p.kind === 'gemini'
            ? `{ 'content-type': 'application/json' }`
            : `{ 'content-type': 'application/json', authorization: \`Bearer \${KEY}\` }`

      return `#!/usr/bin/env node
// Neural Swarm dispatch - ${p.label} / ${meta.id}
const KEY = process.env.API_KEY || '${key}'
const goal = ${JSON.stringify(goalText)}

const res = await fetch(${JSON.stringify(url)}, {
  method: 'POST',
  headers: ${headers},
  body: JSON.stringify(${body}),
})

const reader = res.body.getReader()
const dec = new TextDecoder()
for (;;) {
  const { value, done } = await reader.read()
  if (done) break
  process.stdout.write(dec.decode(value, { stream: true }))
}`
    }

    return `#!/usr/bin/env python3
# Neural Swarm dispatch - ${p.label} / ${meta.id}
import json, os, urllib.request

KEY = os.environ.get("API_KEY", "${key}")
goal = ${JSON.stringify(goalText)}

req = urllib.request.Request(
    ${JSON.stringify(p.kind === 'anthropic' ? `${p.baseUrl}/v1/messages` : `${p.baseUrl}/chat/completions`)},
    data=json.dumps(${JSON.stringify(
      p.kind === 'anthropic'
        ? { model: meta.id, max_tokens: settings.maxTokens, stream: true, messages: [{ role: 'user', content: goalText }] }
        : { model: meta.id, stream: true, messages: [{ role: 'user', content: goalText }] }
    )}).encode(),
    headers={"content-type": "application/json", "x-api-key": KEY, "authorization": f"Bearer {KEY}"},
)
with urllib.request.urlopen(req) as r:
    for line in r:
        print(line.decode().rstrip())`
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="brand">Swarm</div>
          <div className="sub">{status || 'Orchestrator → agents → Overseer'}</div>
        </div>
        {lineage.version > 1 ? <span className="tag info">v{lineage.version}</span> : null}
        <button className="btn sm ghost" onClick={() => setPicker(true)} aria-label="Model">
          ⬡
        </button>
      </div>

      <div className="scroll" ref={scrollRef}>
        <div className="card gold">
          <div className="card-title">Goal</div>
          <textarea
            className="field"
            rows={3}
            placeholder="What should the swarm build, fix, audit or research?"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <div className="scroll-x" style={{ marginTop: 9 }}>
            <ModelPill provider={provider} model={meta.label} onClick={() => setPicker(true)} />
            <button className={`chip${manual ? ' on' : ''}`} onClick={() => { setManual((v) => !v); haptic(8) }}>
              ⚙ {manual ? `${picked.length} agents` : 'Auto agents'}
            </button>
            <button className={`chip${Object.values(localForge).some((v) => (Array.isArray(v) ? v.length : v)) ? ' on' : ''}`} onClick={() => setForge(true)}>
              ✦ Prompt Forge
            </button>
            <button
              className="chip"
              onClick={async () => {
                setVaultItems(await listVault())
                setVaultPick(true)
              }}
            >
              🗝 Vault
            </button>
          </div>

          {manual ? (
            <div className="row wrap" style={{ marginTop: 9 }}>
              {AGENT_KEYS.map((k) => (
                <button
                  key={k}
                  className={`chip${picked.includes(k) ? ' on' : ''}`}
                  onClick={() =>
                    setPicked((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
                  }
                >
                  {AGENTS[k].icon} {AGENTS[k].label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 11, gap: 8 }}>
            <button className="btn primary grow" onClick={launch} disabled={busy || !goal.trim()}>
              {busy ? 'Running…' : '▶ Launch the Swarm'}
            </button>
            {busy ? (
              <button className="btn danger" onClick={stop}>
                ■ Stop
              </button>
            ) : null}
          </div>
        </div>

        {run.plan ? (
          <div className="card">
            <div className="card-title">Execution plan</div>
            <div className="small dim">{run.plan.rationale}</div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              {run.plan.agents.map((a, i) => (
                <span key={`${a}-${i}`} className="tag">
                  {i + 1}. {AGENTS[a]?.label || a}
                </span>
              ))}
            </div>
            {run.plan.note ? <div className="tiny muted" style={{ marginTop: 7 }}>{run.plan.note}</div> : null}
          </div>
        ) : null}

        {run.agents.map((a) => (
          <AgentCard
            key={`${a.name}-${a.index ?? 0}`}
            name={a.name}
            out={a.out}
            error={a.error}
            running={a.running}
            tokens={a.tokens}
            ms={a.ms}
          />
        ))}

        {run.overseer ? (
          <div className="card gold">
            <div className="card-title">
              Overseer
              {run.overseer.match(/(\d{1,2})\s*\/\s*10/) ? (
                <span className="tag ok">{run.overseer.match(/(\d{1,2})\s*\/\s*10/)[1]}/10</span>
              ) : null}
            </div>
            {renderMarkdown(run.overseer)}
          </div>
        ) : null}

        {phase === 'done' ? (
          <div className="card">
            <div className="card-title">Run totals</div>
            <div className="row wrap">
              <span className="tag mono">{formatTokens(cost.tokens)} tokens</span>
              <span className="tag mono">{formatCost(cost.cost)}</span>
              <span className="tag mono">{meta.label}</span>
              <span className="tag mono">{run.agents.length} agents</span>
            </div>
            <div className="row wrap" style={{ marginTop: 10 }}>
              <button
                className="btn sm"
                onClick={async () => {
                  const body = run.agents.map((a) => `## ${AGENTS[a.name]?.label || a.name}\n\n${a.out}`).join('\n\n---\n\n')
                  const full = `# ${goal}\n\n${body}\n\n---\n\n## Overseer\n\n${run.overseer}`
                  downloadFile(`swarm-${Date.now()}.md`, full)
                }}
              >
                ⤓ Export run
              </button>
              <button
                className="btn sm"
                onClick={async () => {
                  const ok = await copyText(run.agents.map((a) => a.out).join('\n\n---\n\n'))
                  toast(ok ? 'Agent output copied' : 'Copy blocked', ok ? 'info' : 'error')
                }}
              >
                ⧉ Copy all
              </button>
              <button
                className="btn sm"
                onClick={() =>
                  saveToVault(
                    goal.slice(0, 60),
                    run.agents.map((a) => `## ${AGENTS[a.name]?.label || a.name}\n\n${a.out}`).join('\n\n'),
                    ['swarm', meta.label]
                  )
                }
              >
                🗝 Save to Vault
              </button>
              <button className="btn sm" onClick={() => onOpenRun?.()}>
                ⇢ Open in Runs
              </button>
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn sm ghost" onClick={() => downloadFile('dispatch.mjs', dispatchScript('node'))}>
                Node dispatch
              </button>
              <button className="btn sm ghost" onClick={() => downloadFile('dispatch.py', dispatchScript('python'))}>
                Python dispatch
              </button>
              <button className="btn sm ghost" onClick={async () => {
                const ok = await copyText(dispatchScript('curl'))
                toast(ok ? 'cURL copied' : 'Copy blocked', ok ? 'info' : 'error')
              }}>
                cURL
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'idle' && !run.agents.length ? (
          <div className="card">
            <div className="card-title">The 10 agents</div>
            <div className="stack">
              {AGENT_KEYS.map((k) => (
                <div key={k} className="row" style={{ alignItems: 'flex-start' }}>
                  <span style={{ width: 20 }}>{AGENTS[k].icon}</span>
                  <span className="grow">
                    <span style={{ fontSize: 13.5 }}>{AGENTS[k].label}</span>
                    <span className="tiny muted" style={{ display: 'block' }}>{AGENTS[k].blurb}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div style={{ height: 8 }} />
      </div>

      <ModelPicker
        open={picker}
        onClose={() => setPicker(false)}
        settings={settings}
        onRefresh={refreshModels}
        refreshing={refreshing}
        onPick={({ providerId, modelId }) => {
          setSettings({ ...settings, defaultProvider: providerId, defaultModel: modelId })
          setPicker(false)
        }}
      />

      <Sheet open={forge} title="Prompt Forge" onClose={() => setForge(false)}>
        <div className="tiny muted" style={{ marginBottom: 12 }}>
          {FORGE_COUNT.toLocaleString()} possible transformations. Shapes voice only — never accuracy.
        </div>

        <span className="label">Personality</span>
        <div className="scroll-x" style={{ marginBottom: 12 }}>
          <button className={`chip${!localForge.personality ? ' on' : ''}`} onClick={() => setLocalForge((f) => ({ ...f, personality: '' }))}>
            none
          </button>
          {Object.keys(PERSONALITIES).map((p) => (
            <button
              key={p}
              className={`chip${localForge.personality === p ? ' on' : ''}`}
              onClick={() => setLocalForge((f) => ({ ...f, personality: f.personality === p ? '' : p }))}
            >
              {p}
            </button>
          ))}
        </div>

        <span className="label">Tone</span>
        <div className="scroll-x" style={{ marginBottom: 12 }}>
          <button className={`chip${!localForge.tone ? ' on' : ''}`} onClick={() => setLocalForge((f) => ({ ...f, tone: '' }))}>
            none
          </button>
          {Object.keys(TONES).map((t) => (
            <button
              key={t}
              className={`chip${localForge.tone === t ? ' on' : ''}`}
              onClick={() => setLocalForge((f) => ({ ...f, tone: f.tone === t ? '' : t }))}
            >
              {t}
            </button>
          ))}
        </div>

        <span className="label">Constraints ({localForge.constraints.length}/15)</span>
        <div className="row wrap" style={{ marginBottom: 14 }}>
          {Object.keys(CONSTRAINTS).map((c) => (
            <button
              key={c}
              className={`chip${localForge.constraints.includes(c) ? ' on' : ''}`}
              onClick={() =>
                setLocalForge((f) => ({
                  ...f,
                  constraints: f.constraints.includes(c) ? f.constraints.filter((x) => x !== c) : [...f.constraints, c],
                }))
              }
            >
              {c}
            </button>
          ))}
        </div>

        {buildForgeDirective(localForge) ? (
          <div className="card">
            <div className="card-title">Preview</div>
            <div className="tiny mono dim">{buildForgeDirective(localForge).slice(0, 520)}</div>
          </div>
        ) : null}

        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={() => setLocalForge({ personality: '', tone: '', constraints: [] })}>
            Clear
          </button>
          <button
            className="btn primary grow"
            onClick={() => {
              setSettings({ ...settings, forge: localForge })
              setForge(false)
              toast('Prompt Forge applied to every agent')
            }}
          >
            Apply
          </button>
        </div>
      </Sheet>

      <Sheet open={vaultPick} title="Inject from Vault" onClose={() => setVaultPick(false)}>
        {!vaultItems.length ? <div className="muted small">The Vault is empty. Save a run or a snippet first.</div> : null}
        {vaultItems.map((v) => (
          <button
            key={v.id}
            className="card"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => {
              setGoal((g) => (g ? `${g}\n\n${v.body}` : v.body))
              setVaultPick(false)
            }}
          >
            <div style={{ fontSize: 14 }}>{v.title}</div>
            <div className="tiny muted">{v.body.slice(0, 90)}…</div>
          </button>
        ))}
      </Sheet>
    </div>
  )
}
