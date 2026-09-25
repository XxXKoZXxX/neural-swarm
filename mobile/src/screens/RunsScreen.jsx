// Runs — every swarm run ever executed on this device, with branch, restore,
// diff and export.

import { useEffect, useMemo, useState } from 'react'
import AgentCard from '../components/AgentCard.jsx'
import { Sheet, haptic, copyText, downloadFile } from '../components/ui.jsx'
import { AGENTS } from '../lib/agents.js'
import { formatCost, formatTokens } from '../lib/catalog.js'
import { renderMarkdown } from '../lib/markdown.js'
import { compactDiff, diffLines, diffStats } from '../lib/diff.js'
import { listRuns, deleteRun, saveRun } from '../lib/store.js'

const when = (ts) =>
  new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function RunsScreen({ toast, seedSwarm, focusId }) {
  const [runs, setRuns] = useState([])
  const [open, setOpen] = useState(null)
  const [diffMode, setDiffMode] = useState(false)
  const [picked, setPicked] = useState([])
  const [diffPair, setDiffPair] = useState(null)

  const refresh = async () => setRuns(await listRuns())

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (focusId) {
      listRuns().then((rows) => {
        setRuns(rows)
        const hit = rows.find((r) => r.id === focusId)
        if (hit) setOpen(hit)
      })
    }
  }, [focusId])

  const togglePick = (run) => {
    setPicked((prev) => {
      const exists = prev.some((p) => p.id === run.id)
      if (exists) return prev.filter((p) => p.id !== run.id)
      return [...prev, run].slice(-2)
    })
  }

  const diffRuns = useMemo(() => {
    if (!diffPair) return null
    const [a, b] = diffPair
    const names = [...new Set([...a.agents.map((x) => x.name), ...b.agents.map((x) => x.name)])]
    return names.map((name) => {
      const left = a.agents.find((x) => x.name === name)?.out || ''
      const right = b.agents.find((x) => x.name === name)?.out || ''
      const rows = compactDiff(diffLines(left, right))
      return { name, rows, stats: diffStats(diffLines(left, right)) }
    })
  }, [diffPair])

  return (
    <div className="screen">
      <div className="topbar">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="brand">Runs</div>
          <div className="sub">
            {runs.length} saved{diffMode ? ` · ${picked.length}/2 selected` : ''}
          </div>
        </div>
        {runs.length ? (
          <button
            className={`btn sm${diffMode ? ' primary' : ' ghost'}`}
            onClick={() => {
              setDiffMode((v) => !v)
              setPicked([])
            }}
          >
            ⇄ Diff
          </button>
        ) : null}
      </div>

      <div className="scroll">
        {diffMode && picked.length === 2 ? (
          <button
            className="btn primary block"
            style={{ marginBottom: 10 }}
            onClick={() => setDiffPair([picked[0], picked[1]])}
          >
            Compare {when(picked[0].createdAt)} vs {when(picked[1].createdAt)}
          </button>
        ) : null}

        {!runs.length ? (
          <div className="card">
            <div className="card-title">No runs yet</div>
            <div className="small dim">Launch a swarm and it lands here with its score, token count and cost.</div>
          </div>
        ) : null}

        {runs.map((run) => {
          const on = picked.some((p) => p.id === run.id)
          return (
            <div
              key={run.id}
              className="card"
              style={{ borderColor: on ? 'var(--gold)' : 'var(--line-soft)', background: on ? 'rgba(217,164,65,.09)' : 'var(--panel)' }}
              onClick={() => (diffMode ? togglePick(run) : setOpen(run))}
            >
              <div className="spread" style={{ alignItems: 'flex-start' }}>
                <span className="grow" style={{ fontSize: 14.5, lineHeight: 1.35 }}>{run.goal}</span>
                {run.score ? <span className="tag ok">{run.score}/10</span> : null}
              </div>
              <div className="row wrap" style={{ marginTop: 9 }}>
                <span className="tag mono">{run.modelMeta?.label || run.model}</span>
                <span className="tag mono">{run.agents?.length || 0} agents</span>
                <span className="tag mono">{formatTokens(run.tokens)} tok</span>
                <span className="tag mono">{formatCost(run.cost)}</span>
                {run.version > 1 ? <span className="tag info">v{run.version}</span> : null}
              </div>
              <div className="tiny muted" style={{ marginTop: 7 }}>
                {when(run.createdAt)}
                {run.plan?.source === 'manual' ? ' · manual agents' : ''}
                {run.plan?.source === 'heuristic' ? ' · auto-routed' : ''}
              </div>
            </div>
          )
        })}
        <div style={{ height: 8 }} />
      </div>

      {/* ---------------------------------------------------------- run detail */}
      <Sheet
        open={Boolean(open) && !diffPair}
        title="Run detail"
        onClose={() => setOpen(null)}
        right={
          open ? (
            <button
              className="btn sm ghost"
              onClick={() => {
                seedSwarm?.({ goal: open.goal, branchOf: open.id, version: (open.version || 1) + 1 })
                setOpen(null)
              }}
            >
              ⑂ Branch
            </button>
          ) : null
        }
      >
        {open ? (
          <>
            <div className="card gold">
              <div className="card-title">Goal</div>
              <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{open.goal}</div>
              <div className="row wrap" style={{ marginTop: 9 }}>
                <span className="tag mono">{open.providerLabel || open.providerId}</span>
                <span className="tag mono">{open.modelMeta?.label || open.model}</span>
                <span className="tag mono">{formatTokens(open.tokens)} tok</span>
                <span className="tag mono">{formatCost(open.cost)}</span>
                {open.ms ? <span className="tag mono">{(open.ms / 1000).toFixed(1)}s</span> : null}
              </div>
            </div>

            {open.plan ? (
              <div className="card">
                <div className="card-title">Plan</div>
                <div className="small dim">{open.plan.rationale}</div>
                <div className="tiny muted mono" style={{ marginTop: 6 }}>
                  {(open.plan.agents || []).join(' → ')}
                </div>
              </div>
            ) : null}

            {(open.agents || []).map((a, i) => (
              <AgentCard key={`${a.name}-${i}`} name={a.name} out={a.out} error={a.error} tokens={a.tokens} ms={a.ms} defaultOpen={false} />
            ))}

            {open.overseer ? (
              <div className="card gold">
                <div className="card-title">Overseer</div>
                {renderMarkdown(open.overseer)}
              </div>
            ) : null}

            <div className="row wrap" style={{ gap: 6 }}>
              <button
                className="btn sm"
                onClick={() => {
                  seedSwarm?.({ goal: open.goal })
                  setOpen(null)
                  toast('Loaded into the Swarm editor')
                }}
              >
                ↺ Restore
              </button>
              <button
                className="btn sm"
                onClick={async () => {
                  await saveRun({ ...open, id: crypto.randomUUID(), createdAt: Date.now(), branchOf: open.id, version: (open.version || 1) + 1 })
                  await refresh()
                  toast('Branched into a new run')
                }}
              >
                ⑂ Duplicate
              </button>
              <button
                className="btn sm ghost"
                onClick={async () => {
                  const body = (open.agents || []).map((a) => `## ${AGENTS[a.name]?.label || a.name}\n\n${a.out}`).join('\n\n---\n\n')
                  downloadFile(`run-${open.id.slice(0, 6)}.md`, `# ${open.goal}\n\n${body}\n\n---\n\n## Overseer\n\n${open.overseer}`)
                }}
              >
                ⤓ Export
              </button>
              <button
                className="btn sm ghost"
                onClick={async () => {
                  const ok = await copyText((open.agents || []).map((a) => a.out).join('\n\n---\n\n'))
                  toast(ok ? 'Copied' : 'Copy blocked', ok ? 'info' : 'error')
                }}
              >
                ⧉ Copy
              </button>
              <button
                className="btn sm ghost danger"
                onClick={async () => {
                  await deleteRun(open.id)
                  await refresh()
                  setOpen(null)
                }}
              >
                ✕ Delete
              </button>
            </div>
          </>
        ) : null}
      </Sheet>

      {/* --------------------------------------------------------------- diff */}
      <Sheet
        open={Boolean(diffPair)}
        title="Diff"
        onClose={() => {
          setDiffPair(null)
          setPicked([])
        }}
      >
        {diffPair ? (
          <>
            <div className="card">
              <div className="tiny mono dim">A · {when(diffPair[0].createdAt)} · {diffPair[0].modelMeta?.label}</div>
              <div className="tiny mono dim">B · {when(diffPair[1].createdAt)} · {diffPair[1].modelMeta?.label}</div>
            </div>
            {diffRuns?.map((section) => (
              <div key={section.name} className="card">
                <div className="card-title">
                  {AGENTS[section.name]?.label || section.name}
                  <span className="tag" style={{ color: 'var(--ok)' }}>+{section.stats.added}</span>
                  <span className="tag bad">−{section.stats.removed}</span>
                </div>
                <pre className="md-pre" style={{ fontSize: 11.5, maxHeight: 320, overflow: 'auto' }}>
                  {section.rows.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        color: r.type === 'add' ? 'var(--ok)' : r.type === 'del' ? 'var(--danger)' : 'var(--text-dim)',
                        opacity: r.type === 'gap' ? 0.45 : 1,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {r.type === 'gap' ? '   ⋯' : `${r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '} ${r.line}`}
                    </div>
                  ))}
                </pre>
              </div>
            ))}
          </>
        ) : null}
      </Sheet>
    </div>
  )
}
