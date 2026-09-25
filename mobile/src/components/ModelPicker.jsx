// Model picker — every provider, every model, live-discovered lists included.

import { useMemo, useState } from 'react'
import { PROVIDERS, modelsFor, formatCost } from '../lib/catalog.js'
import { Sheet, Chip, haptic } from './ui.jsx'

function priceLabel(m) {
  if (!m.inPrice && !m.outPrice) return 'free'
  return `${m.inPrice ?? 0}/${m.outPrice ?? 0}`
}

export default function ModelPicker({
  open,
  onClose,
  settings,
  onPick,
  onToggle,
  multi = false,
  selected = [],
  onRefresh,
  refreshing,
}) {
  const [query, setQuery] = useState('')
  const [onlyReady, setOnlyReady] = useState(false)

  const ready = (p) => p.requiresKey === false || Boolean(settings.keys?.[p.id])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PROVIDERS.map((p) => {
      const list = modelsFor(p, settings.discovered).filter(
        (m) => !q || m.id.toLowerCase().includes(q) || (m.label || '').toLowerCase().includes(q)
      )
      return { provider: p, list, isReady: ready(p) }
    }).filter((g) => !onlyReady || g.isReady)
  }, [query, settings, onlyReady])

  const readyCount = PROVIDERS.filter(ready).length

  return (
    <Sheet
      open={open}
      title="Model"
      onClose={onClose}
      right={
        <button className="btn sm ghost" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? '…' : '↻ Sync'}
        </button>
      }
    >
      <input
        className="field"
        placeholder="Search models…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10 }}
      />

      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Chip on={onlyReady} onClick={() => setOnlyReady((v) => !v)}>
          Ready only ({readyCount}/{PROVIDERS.length})
        </Chip>
        {multi ? <span className="tiny muted">{selected.length} selected</span> : null}
      </div>

      {groups.map(({ provider, list, isReady }) => (
        <div key={provider.id} style={{ marginBottom: 16 }}>
          <div className="row" style={{ marginBottom: 7 }}>
            <span className="tag">{provider.short}</span>
            <span className="small grow">{provider.label}</span>
            {provider.local ? <span className="tag info">local</span> : null}
            {!isReady ? <span className="tag bad">no key</span> : null}
          </div>

          {provider.note ? <div className="tiny muted" style={{ marginBottom: 7 }}>{provider.note}</div> : null}

          {list.length === 0 ? (
            <div className="tiny muted">
              {isReady ? 'No models listed — tap ↻ Sync to pull the live list.' : 'Add a key in Settings to load models.'}
            </div>
          ) : (
            list.map((m) => {
              const isOn = multi
                ? selected.some((s) => s.providerId === provider.id && s.modelId === m.id)
                : settings.defaultProvider === provider.id && settings.defaultModel === m.id
              const key = `${provider.id}:${m.id}`
              return (
                <button
                  key={key}
                  className="card"
                  onClick={() => {
                    haptic(8)
                    if (multi) onToggle?.({ providerId: provider.id, modelId: m.id, label: m.label || m.id })
                    else onPick?.({ providerId: provider.id, modelId: m.id })
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 12px',
                    marginBottom: 6,
                    borderColor: isOn ? 'var(--gold)' : 'var(--line-soft)',
                    background: isOn ? 'rgba(217,164,65,.1)' : 'var(--panel)',
                  }}
                >
                  <span className="grow">
                    <span style={{ display: 'block', fontSize: 14 }}>{m.label || m.id}</span>
                    <span className="tiny muted mono">{m.id}</span>
                  </span>
                  <span className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
                    {m.tag ? <span className="tag">{m.tag}</span> : null}
                    <span className="tiny muted mono">{priceLabel(m)}</span>
                  </span>
                  {isOn ? <span style={{ color: 'var(--gold)' }}>✓</span> : null}
                </button>
              )
            })
          )}

          <div className="tiny muted">
            {provider.kind === 'anthropic' ? 'Anthropic API' : provider.kind === 'gemini' ? 'Google API' : 'OpenAI-compatible'} ·{' '}
            <span className="mono">{provider.baseUrl || 'set base URL in Settings'}</span>
          </div>
        </div>
      ))}

      {!groups.length ? <div className="muted small">Nothing matches that search.</div> : null}
    </Sheet>
  )
}

export function ModelPill({ provider, model, multi, count, onClick }) {
  return (
    <button className="chip" onClick={onClick} style={{ maxWidth: '100%' }}>
      <span className="tag">{provider?.short || '—'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {multi ? `${count} models` : model}
      </span>
      <span style={{ opacity: 0.5 }}>▾</span>
    </button>
  )
}
