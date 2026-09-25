// Flow — touch DAG builder. Drag nodes, tap ⇢ then a target to link, run it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, haptic } from '../components/ui.jsx'
import { AGENTS, AGENT_KEYS } from '../lib/agents.js'
import { FLOW_PRESETS, topoSort } from '../lib/swarm.js'
import { listFlows, saveFlow, deleteFlow } from '../lib/store.js'

const NODE_W = 104
const NODE_H = 60

let seed = 0
const newNode = (agent, x, y) => ({ id: `n${Date.now().toString(36)}${seed++}`, agent, x, y })

function presetGraph(agents, width) {
  seed = 0
  const gap = Math.min(140, Math.max(96, (width - 40) / Math.max(agents.length, 1)))
  const nodes = agents.map((agent, i) => newNode(agent, 14 + i * gap, 30 + (i % 2) * 100))
  const edges = nodes.slice(1).map((n, i) => ({ id: `e${i}`, from: nodes[i].id, to: n.id }))
  return { nodes, edges }
}

export default function FlowScreen({ settings, toast, prefill, clearPrefill, onOpenRun }) {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [linkFrom, setLinkFrom] = useState(null)
  const [selected, setSelected] = useState(null)
  const [goal, setGoal] = useState('')
  const [flows, setFlows] = useState([])
  const [flowsOpen, setFlowsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [savedId, setSavedId] = useState(null)

  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const rafRef = useRef(0)

  useEffect(() => {
    listFlows().then(setFlows)
  }, [])

  useEffect(() => {
    if (prefill) {
      setGoal(prefill)
      clearPrefill?.()
    }
  }, [prefill, clearPrefill])

  const width = () => canvasRef.current?.clientWidth || 360

  const loadPreset = (preset) => {
    const g = presetGraph(preset.agents, width())
    setNodes(g.nodes)
    setEdges(g.edges)
    setSavedId(null)
    setGoal((prev) => prev || `Run the ${preset.name} pipeline`)
    haptic(10)
  }

  const addNode = (agent) => {
    setNodes((prev) => {
      const n = newNode(agent, 20 + ((prev.length * 26) % 180), 24 + ((prev.length * 34) % 210))
      return [...prev, n]
    })
    setAddOpen(false)
  }

  const deleteNode = (id) => {
    setNodes((prev) => prev.filter((n) => n.id !== id))
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id))
    setSelected(null)
    setLinkFrom(null)
  }

  const toggleLink = (id) => {
    if (linkFrom === null) {
      setLinkFrom(id)
      haptic(8)
      return
    }
    if (linkFrom === id) {
      setLinkFrom(null)
      return
    }
    setEdges((prev) => {
      if (prev.some((e) => e.from === linkFrom && e.to === id)) return prev
      return [...prev, { id: `e${Date.now().toString(36)}`, from: linkFrom, to: id }]
    })
    setLinkFrom(null)
    haptic(12)
  }

  // ---- drag, batched to one update per frame
  const onPointerDown = (e, node) => {
    if (e.target.closest('[data-nodrag]')) return
    const rect = canvasRef.current.getBoundingClientRect()
    dragRef.current = {
      id: node.id,
      dx: e.clientX - rect.left - node.x,
      dy: e.clientY - rect.top - node.y,
      rect,
    }
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setSelected(node.id)
  }

  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const x = Math.max(0, Math.min(d.rect.width - NODE_W, e.clientX - d.rect.left - d.dx))
    const y = Math.max(0, Math.min(d.rect.height - NODE_H, e.clientY - d.rect.top - d.dy))
    const pending = { id: d.id, x, y }
    dragRef.current.pending = pending
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const p = dragRef.current?.pending
      if (!p) return
      setNodes((prev) => prev.map((n) => (n.id === p.id ? { ...n, x: p.x, y: p.y } : n)))
    })
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const centers = useMemo(() => {
    const map = new Map()
    for (const n of nodes) map.set(n.id, { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 })
    return map
  }, [nodes])

  const order = useMemo(() => {
    if (!nodes.length) return []
    try {
      return topoSort(nodes, edges).map((n) => n.agent)
    } catch {
      return []
    }
  }, [nodes, edges])

  const launch = () => {
    if (!nodes.length) return toast('Add at least one agent to the flow', 'error')
    if (!goal.trim()) return toast('Give the flow a goal first', 'error')
    let seq
    try {
      seq = topoSort(nodes, edges).map((n) => n.agent)
    } catch (err) {
      return toast(err.message, 'error')
    }
    // Hand the ordered list to the Swarm screen so the run has one engine.
    onOpenRun?.({ agents: seq, goal: goal.trim() })
    haptic(16)
  }

  const save = async () => {
    const flow = {
      id: savedId || crypto.randomUUID(),
      name: goal.trim().slice(0, 40) || `Flow ${new Date().toLocaleTimeString()}`,
      nodes,
      edges,
      createdAt: Date.now(),
    }
    const row = await saveFlow(flow)
    setSavedId(row.id)
    setFlows(await listFlows())
    toast('Flow saved')
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="brand">Flow</div>
          <div className="sub">
            {nodes.length} agents · {edges.length} links{linkFrom ? ' · tap a target to link' : ''}
          </div>
        </div>
        <button className="btn sm ghost" onClick={() => setFlowsOpen(true)}>
          ☰
        </button>
        <button className="btn sm primary" onClick={() => setAddOpen(true)}>
          +
        </button>
      </div>

      <div className="scroll" style={{ padding: '10px 10px 24px' }}>
        <div className="scroll-x" style={{ marginBottom: 9 }}>
          {FLOW_PRESETS.map((p) => (
            <button key={p.name} className="chip" onClick={() => loadPreset(p)}>
              {p.name}
            </button>
          ))}
        </div>

        <div
          ref={canvasRef}
          className="card"
          style={{
            position: 'relative',
            height: '46dvh',
            minHeight: 260,
            padding: 0,
            overflow: 'hidden',
            background:
              'radial-gradient(circle at 1px 1px, rgba(217,164,65,.16) 1px, transparent 0) 0 0 / 22px 22px, var(--panel)',
            touchAction: 'none',
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelected(null)
              setLinkFrom(null)
            }
          }}
        >
          <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#d9a441" />
              </marker>
            </defs>
            {edges.map((e) => {
              const a = centers.get(e.from)
              const b = centers.get(e.to)
              if (!a || !b) return null
              return (
                <line
                  key={e.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#d9a441"
                  strokeOpacity=".55"
                  strokeWidth="1.8"
                  markerEnd="url(#arrow)"
                />
              )
            })}
          </svg>

          {nodes.map((n) => {
            const def = AGENTS[n.agent] || { icon: '◇', label: n.agent }
            const isSel = selected === n.id
            const isLink = linkFrom === n.id
            return (
              <div
                key={n.id}
                onPointerDown={(e) => {
                  if (linkFrom) {
                    toggleLink(n.id)
                    return
                  }
                  onPointerDown(e, n)
                }}
                style={{
                  position: 'absolute',
                  left: n.x,
                  top: n.y,
                  width: NODE_W,
                  height: NODE_H,
                  borderRadius: 12,
                  border: `1px solid ${isLink ? 'var(--gold-bright)' : isSel ? 'var(--gold)' : 'var(--line-soft)'}`,
                  background: isLink ? 'rgba(240,205,122,.18)' : 'rgba(28,20,23,.97)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  fontSize: 10.5,
                  fontFamily: 'var(--mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  boxShadow: isSel || isLink ? '0 6px 18px rgba(0,0,0,.5)' : 'none',
                }}
              >
                <span style={{ fontSize: 14 }}>{def.icon}</span>
                <span>{def.label}</span>
                <div style={{ position: 'absolute', top: -11, right: -8, display: 'flex', gap: 4 }}>
                  <button
                    data-nodrag
                    className="chip"
                    style={{ padding: '2px 7px', fontSize: 10 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleLink(n.id)
                    }}
                  >
                    ⇢
                  </button>
                  {isSel ? (
                    <button
                      data-nodrag
                      className="chip"
                      style={{ padding: '2px 7px', fontSize: 10, color: 'var(--danger)' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteNode(n.id)
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}

          {!nodes.length ? (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 20 }}>
              <div>
                <div style={{ fontSize: 26 }}>🕸</div>
                <div className="small dim">Pick a preset, or tap + to add an agent.</div>
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  Drag to move · ⇢ then tap another node to link
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="card">
          <div className="card-title">Flow goal</div>
          <textarea
            className="field"
            rows={2}
            placeholder="What does this pipeline need to achieve?"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <div className="small dim" style={{ marginTop: 9 }}>
            Execution order:{' '}
            {order.length ? (
              <span className="mono">{order.join(' → ')}</span>
            ) : nodes.length ? (
              <span style={{ color: 'var(--danger)' }}>cycle detected — remove a link</span>
            ) : (
              <span className="muted">empty</span>
            )}
          </div>
          <div className="row" style={{ marginTop: 11, gap: 8 }}>
            <button className="btn primary grow" onClick={launch}>
              ▶ Run flow
            </button>
            <button className="btn" onClick={save}>
              ⤓ Save
            </button>
          </div>
        </div>

        {edges.length ? (
          <div className="card">
            <div className="card-title">Connections</div>
            <div className="row wrap">
              {edges.map((e) => {
                const a = nodes.find((n) => n.id === e.from)
                const b = nodes.find((n) => n.id === e.to)
                return (
                  <span key={e.id} className="chip mono">
                    {a?.agent?.slice(0, 4)} → {b?.agent?.slice(0, 4)}
                    <span
                      onClick={() => setEdges((prev) => prev.filter((x) => x.id !== e.id))}
                      style={{ color: 'var(--danger)' }}
                    >
                      ✕
                    </span>
                  </span>
                )
              })}
            </div>
          </div>
        ) : null}
        <div style={{ height: 8 }} />
      </div>

      <Sheet open={addOpen} title="Add agent" onClose={() => setAddOpen(false)}>
        {AGENT_KEYS.map((k) => (
          <button key={k} className="card" style={{ width: '100%', textAlign: 'left' }} onClick={() => addNode(k)}>
            <div className="row">
              <span>{AGENTS[k].icon}</span>
              <span className="grow">
                <span style={{ display: 'block', fontSize: 14 }}>{AGENTS[k].label}</span>
                <span className="tiny muted">{AGENTS[k].blurb}</span>
              </span>
            </div>
          </button>
        ))}
      </Sheet>

      <Sheet open={flowsOpen} title="Saved flows" onClose={() => setFlowsOpen(false)}>
        {!flows.length ? <div className="muted small">No saved flows yet.</div> : null}
        {flows.map((f) => (
          <button
            key={f.id}
            className="card"
            style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
            onClick={() => {
              setNodes(f.nodes || [])
              setEdges(f.edges || [])
              setSavedId(f.id)
              setFlowsOpen(false)
            }}
          >
            <span className="grow">
              <span style={{ display: 'block', fontSize: 14 }}>{f.name}</span>
              <span className="tiny muted">{(f.nodes || []).length} agents</span>
            </span>
            <span
              onClick={async (e) => {
                e.stopPropagation()
                await deleteFlow(f.id)
                setFlows(await listFlows())
              }}
              style={{ color: 'var(--danger)', padding: 6 }}
            >
              ✕
            </span>
          </button>
        ))}
      </Sheet>
    </div>
  )
}
