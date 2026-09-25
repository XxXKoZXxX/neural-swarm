// Vault — saved snippets, decisions and run outputs. Inject into any goal.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sheet, haptic, copyText, downloadFile } from '../components/ui.jsx'
import { listVault, saveVaultItem, deleteVaultItem } from '../lib/store.js'

const blank = () => ({ id: crypto.randomUUID(), title: '', body: '', tags: [], kind: 'snippet', createdAt: Date.now() })

export default function VaultScreen({ toast, sendToChat, sendToSwarm }) {
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [tagFilter, setTagFilter] = useState('')

  const refresh = useCallback(async () => setItems(await listVault()), [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const tags = useMemo(() => {
    const set = new Set()
    items.forEach((i) => (i.tags || []).forEach((t) => set.add(t)))
    return [...set].slice(0, 24)
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (tagFilter && !(i.tags || []).includes(tagFilter)) return false
      if (!q) return true
      return `${i.title} ${i.body} ${(i.tags || []).join(' ')}`.toLowerCase().includes(q)
    })
  }, [items, query, tagFilter])

  const save = async (item) => {
    const row = {
      ...item,
      title: item.title.trim() || item.body.trim().slice(0, 40) || 'Untitled',
      tags: typeof item.tags === 'string' ? item.tags.split(',').map((t) => t.trim()).filter(Boolean) : item.tags,
    }
    await saveVaultItem(row)
    await refresh()
    setEditing(null)
    toast('Saved')
  }

  return (
    <div className="screen">
      <div className="topbar">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="brand">Vault</div>
          <div className="sub">{items.length} entries · local only</div>
        </div>
        {items.length ? (
          <button
            className="btn sm ghost"
            onClick={() => downloadFile('neural-vault.json', JSON.stringify(items, null, 2))}
          >
            ⤓
          </button>
        ) : null}
        <button className="btn sm primary" onClick={() => setEditing(blank())}>
          +
        </button>
      </div>

      <div className="scroll">
        <input
          className="field"
          placeholder="Search the vault…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 10 }}
        />

        {tags.length ? (
          <div className="scroll-x" style={{ marginBottom: 12 }}>
            <button className={`chip${!tagFilter ? ' on' : ''}`} onClick={() => setTagFilter('')}>
              all
            </button>
            {tags.map((t) => (
              <button key={t} className={`chip${tagFilter === t ? ' on' : ''}`} onClick={() => setTagFilter(tagFilter === t ? '' : t)}>
                {t}
              </button>
            ))}
          </div>
        ) : null}

        {!filtered.length ? (
          <div className="card">
            <div className="card-title">Empty</div>
            <div className="small dim">
              Save architecture decisions, prompt snippets and agent outputs here. Anything in the Vault can be injected into a
              chat or a swarm goal in one tap.
            </div>
          </div>
        ) : null}

        {filtered.map((item) => (
          <div key={item.id} className="card">
            <div className="spread">
              <span className="grow" style={{ fontSize: 14.5, fontWeight: 600 }}>{item.title}</span>
              {item.kind ? <span className="tag">{item.kind}</span> : null}
            </div>
            <div className="small dim" style={{ margin: '6px 0 9px', whiteSpace: 'pre-wrap' }}>
              {item.body.length > 220 ? `${item.body.slice(0, 220)}…` : item.body}
            </div>
            {(item.tags || []).length ? (
              <div className="row wrap" style={{ marginBottom: 9 }}>
                {item.tags.map((t) => (
                  <span key={t} className="tag info">{t}</span>
                ))}
              </div>
            ) : null}
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm" onClick={() => sendToChat?.(item.body)}>
                ⇢ Chat
              </button>
              <button className="btn sm" onClick={() => sendToSwarm?.({ goal: item.body })}>
                ⇢ Swarm
              </button>
              <button
                className="btn sm ghost"
                onClick={async () => {
                  const ok = await copyText(item.body)
                  haptic(10)
                  toast(ok ? 'Copied' : 'Copy blocked', ok ? 'info' : 'error')
                }}
              >
                ⧉
              </button>
              <button className="btn sm ghost" onClick={() => setEditing({ ...item })}>
                ✎
              </button>
              <button
                className="btn sm ghost danger"
                onClick={async () => {
                  await deleteVaultItem(item.id)
                  await refresh()
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <div style={{ height: 8 }} />
      </div>

      <Sheet open={Boolean(editing)} title={editing?.title ? 'Edit entry' : 'New entry'} onClose={() => setEditing(null)}>
        {editing ? (
          <>
            <span className="label">Title</span>
            <input
              className="field"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              style={{ marginBottom: 12 }}
            />
            <span className="label">Kind</span>
            <div className="scroll-x" style={{ marginBottom: 12 }}>
              {['snippet', 'decision', 'swarm', 'prompt', 'reference'].map((k) => (
                <button
                  key={k}
                  className={`chip${editing.kind === k ? ' on' : ''}`}
                  onClick={() => setEditing({ ...editing, kind: k })}
                >
                  {k}
                </button>
              ))}
            </div>
            <span className="label">Body</span>
            <textarea
              className="field"
              rows={9}
              value={editing.body}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              style={{ marginBottom: 12 }}
            />
            <span className="label">Tags (comma separated)</span>
            <input
              className="field"
              value={Array.isArray(editing.tags) ? editing.tags.join(', ') : editing.tags}
              onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
              style={{ marginBottom: 14 }}
            />
            <button className="btn primary block" onClick={() => save(editing)}>
              Save to Vault
            </button>
          </>
        ) : null}
      </Sheet>
    </div>
  )
}
