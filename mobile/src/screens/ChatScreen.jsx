// Chat — talk to any provider's model, switch brains mid-conversation, or fan
// one prompt out to several models at once and compare.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Message from '../components/Message.jsx'
import ModelPicker, { ModelPill } from '../components/ModelPicker.jsx'
import { Sheet, haptic, copyText, downloadFile } from '../components/ui.jsx'
import { providerById, modelMeta, estimateCost, formatCost, formatTokens } from '../lib/catalog.js'
import { streamChat } from '../lib/providers.js'
import { listChats, saveChat, deleteChat } from '../lib/store.js'
import { summarize } from '../lib/markdown.js'

const newChat = () => ({
  id: crypto.randomUUID(),
  title: 'New chat',
  system: '',
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

export default function ChatScreen({ settings, setSettings, toast, refreshModels, refreshing, prefill, clearPrefill }) {
  const [chats, setChats] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [compareOn, setCompareOn] = useState(false)
  const [compare, setCompare] = useState([])
  const [drawer, setDrawer] = useState(false)
  const [optsOpen, setOptsOpen] = useState(false)

  const abortRef = useRef(null)
  const scrollRef = useRef(null)
  const textRef = useRef(null)
  const buffers = useRef({})
  const rafRef = useRef(0)
  const activeIdRef = useRef(null)
  const systemRef = useRef('')

  const active = useMemo(() => chats.find((c) => c.id === activeId) || null, [chats, activeId])
  const provider = providerById(settings.defaultProvider)
  const meta = modelMeta(provider, settings.defaultModel, settings.discovered)

  // ------------------------------------------------------------- persistence

  useEffect(() => {
    let alive = true
    listChats().then((rows) => {
      if (!alive) return
      if (rows.length) {
        setChats(rows)
        setActiveId(rows[0].id)
      } else {
        const fresh = newChat()
        setChats([fresh])
        setActiveId(fresh.id)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const persist = useCallback((chat) => {
    setChats((prev) => [chat, ...prev.filter((c) => c.id !== chat.id)])
    saveChat(chat)
  }, [])

  const patchActive = useCallback(
    (patch) => {
      setChats((prev) => {
        const current = prev.find((c) => c.id === activeId)
        if (!current) return prev
        const next = { ...current, ...patch, updatedAt: Date.now() }
        saveChat(next)
        return [next, ...prev.filter((c) => c.id !== next.id)]
      })
    },
    [activeId]
  )

  // Shared target used for streaming; retry/regenerate reuse the same parts.
  const targetOf = useCallback(
    (providerId, modelId) => {
      const p = providerById(providerId || settings.defaultProvider)
      const withBase = settings.baseOverrides?.[p.id] ? { ...p, baseUrl: settings.baseOverrides[p.id] } : p
      const m = modelMeta(withBase, modelId || settings.defaultModel, settings.discovered)
      return { provider: withBase, model: m.id, meta: m, key: settings.keys?.[withBase.id] || '' }
    },
    [settings]
  )

  // Batches tokens into one paint per frame — per-token React updates stutter on phones.
  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const pending = buffers.current
      buffers.current = {}
      const keys = Object.keys(pending)
      if (!keys.length) return
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== activeIdRef.current) return c
          const messages = c.messages.map((m) =>
            pending[m.id] !== undefined ? { ...m, content: m.content + pending[m.id] } : m
          )
          return { ...c, messages }
        })
      )
    })
  }, [])

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  // Read by the streamer so a mid-stream settings change cannot swap the
  // system prompt out from under an in-flight reply.
  useEffect(() => {
    systemRef.current = active?.system || ''
  }, [active?.system])

  const streamOne = useCallback(
    async ({ chatId, baseMessages, targets, signal }) => {
      const results = []

      await Promise.all(
        targets.map(async (t) => {
          const target = targetOf(t.providerId, t.modelId)
          const assistantId = crypto.randomUUID()
          const placeholder = {
            id: assistantId,
            role: 'assistant',
            content: '',
            providerId: target.provider.id,
            providerShort: target.provider.short,
            modelId: target.model,
            modelLabel: target.meta.label,
            createdAt: Date.now(),
            streaming: true,
          }

          setChats((prev) =>
            prev.map((c) => (c.id === chatId ? { ...c, messages: [...c.messages, placeholder] } : c))
          )

          const usage = { input_tokens: 0, output_tokens: 0 }
          try {
            const res = await streamChat({
              provider: target.provider,
              model: target.model,
              key: target.key,
              system: systemRef.current || undefined,
              messages: baseMessages,
              maxTokens: settings.maxTokens,
              signal,
              onToken: (piece) => {
                buffers.current[assistantId] = (buffers.current[assistantId] || '') + piece
                scheduleFlush()
              },
              onUsage: (u) => Object.assign(usage, u),
            })
            results.push({ assistantId, ok: true })
            setChats((prev) =>
              prev.map((c) =>
                c.id === chatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              content: res.text,
                              streaming: false,
                              usage,
                              cost: estimateCost(target.meta, usage),
                            }
                          : m
                      ),
                    }
                  : c
              )
            )
          } catch (err) {
            results.push({ assistantId, ok: false })
            const aborted = err?.name === 'AbortError'
            setChats((prev) =>
              prev.map((c) =>
                c.id === chatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantId
                          ? {
                              ...m,
                              streaming: false,
                              error: aborted ? 'Stopped.' : err.message,
                              content: (m.content || '') + (buffers.current[assistantId] || ''),
                            }
                          : m
                      ),
                    }
                  : c
              )
            )
          } finally {
            buffers.current[assistantId] = ''
          }
        })
      )

      return results
    },
    [settings, targetOf, scheduleFlush]
  )

  const send = useCallback(
    async (textOverride, retryTargets) => {
      const text = (textOverride ?? input).trim()
      if (!text || !active) return
      if (busy) return

      const targets = retryTargets || (compareOn && compare.length ? compare : [{ providerId: settings.defaultProvider, modelId: settings.defaultModel }])

      const userMsg = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        createdAt: Date.now(),
      }

      const history = [...active.messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: text }]

      const nextChat = {
        ...active,
        title: active.messages.length === 0 ? summarize(text) : active.title,
        messages: [...active.messages, userMsg],
        updatedAt: Date.now(),
      }
      persist(nextChat)
      setInput('')
      setBusy(true)
      haptic(14)
      requestAnimationFrame(() => scrollToEnd())

      const ctrl = new AbortController()
      abortRef.current = ctrl

      try {
        await streamOne({ chatId: nextChat.id, baseMessages: history, targets, signal: ctrl.signal })
      } catch (err) {
        if (err?.name !== 'AbortError') toast(err.message, 'error')
      } finally {
        setBusy(false)
        abortRef.current = null
        setChats((prev) => {
          const c = prev.find((x) => x.id === nextChat.id)
          if (c) saveChat({ ...c, messages: c.messages.map((m) => ({ ...m, streaming: false })) })
          return prev
        })
        requestAnimationFrame(() => scrollToEnd())
      }
    },
    [input, active, busy, compareOn, compare, settings, persist, streamOne, toast]
  )

  const stop = () => {
    abortRef.current?.abort()
    haptic(20)
  }

  const regenerate = useCallback(() => {
    if (!active || busy) return
    const msgs = [...active.messages]
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
    if (!lastUser) return
    // Drop everything after the last user turn, then re-run it.
    const cut = msgs.findIndex((m) => m.id === lastUser.id)
    const trimmed = msgs.slice(0, cut)
    const history = [...trimmed.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: lastUser.content }]
    const nextChat = { ...active, messages: [...trimmed, lastUser] }
    persist(nextChat)
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    streamOne({
      chatId: nextChat.id,
      baseMessages: history,
      targets: [{ providerId: settings.defaultProvider, modelId: settings.defaultModel }],
      signal: ctrl.signal,
    })
      .catch((err) => err?.name !== 'AbortError' && toast(err.message, 'error'))
      .finally(() => {
        setBusy(false)
        abortRef.current = null
      })
  }, [active, busy, persist, settings, streamOne, toast])

  const scrollToEnd = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    scrollToEnd()
  }, [activeId])

  // Text shared into the app from another Android app (share target).
  useEffect(() => {
    if (prefill) {
      setInput(prefill)
      clearPrefill?.()
      requestAnimationFrame(() => textRef.current?.focus())
    }
  }, [prefill, clearPrefill])

  const startNew = () => {
    const fresh = newChat()
    setChats((prev) => [fresh, ...prev])
    setActiveId(fresh.id)
    setDrawer(false)
    saveChat(fresh)
  }

  const totals = useMemo(() => {
    const list = active?.messages || []
    const tokens = list.reduce((sum, m) => sum + ((m.usage?.input_tokens || 0) + (m.usage?.output_tokens || 0)), 0)
    const cost = list.reduce((sum, m) => sum + (m.cost || 0), 0)
    return { tokens, cost }
  }, [active])

  const toggleCompare = (entry) => {
    setCompare((prev) => {
      const exists = prev.some((p) => p.providerId === entry.providerId && p.modelId === entry.modelId)
      return exists ? prev.filter((p) => !(p.providerId === entry.providerId && p.modelId === entry.modelId)) : [...prev, entry]
    })
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn sm ghost" onClick={() => setDrawer(true)} aria-label="Chats">
          ☰
        </button>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="brand">Chat</div>
          <div className="sub">
            {totals.tokens ? `${formatTokens(totals.tokens)} tok · ${formatCost(totals.cost)}` : active?.title || 'New chat'}
          </div>
        </div>
        <button className="btn sm ghost" onClick={() => setOptsOpen(true)} aria-label="Chat options">
          ⋯
        </button>
        <button className="btn sm primary" onClick={startNew}>
          +
        </button>
      </div>

      <div className="scroll" ref={scrollRef}>
        {!active?.messages.length ? (
          <div className="card gold" style={{ textAlign: 'center', padding: 22 }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>⬡</div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>Any model. Any time.</div>
            <div className="small muted" style={{ marginTop: 6 }}>
              {provider.label} · {meta.label}
            </div>
            <div className="tiny muted" style={{ marginTop: 10 }}>
              Switch models mid-thread and the whole conversation comes along. Turn on compare to ask several models at once.
            </div>
          </div>
        ) : (
          active.messages.map((msg) => (
            <Message
              key={msg.id}
              msg={msg}
              streaming={busy && msg.streaming}
              onRetry={msg.role === 'assistant' && !busy ? regenerate : null}
              onDelete={
                busy
                  ? null
                  : (target) =>
                      patchActive({ messages: active.messages.filter((m) => m.id !== target.id) })
              }
            />
          ))
        )}
        <div style={{ height: 8 }} />
      </div>

      <div className="composer">
        <div className="scroll-x" style={{ marginBottom: 8 }}>
          <ModelPill
            provider={provider}
            model={meta.label}
            multi={compareOn}
            count={compare.length}
            onClick={() => setPicker(true)}
          />
          <button className={`chip${compareOn ? ' on' : ''}`} onClick={() => { setCompareOn((v) => !v); haptic(8) }}>
            ⇄ Compare
          </button>
          {compareOn && compare.length > 0
            ? compare.map((c) => (
                <span key={`${c.providerId}:${c.modelId}`} className="chip mono on">
                  {c.label || c.modelId}
                  <span onClick={() => toggleCompare(c)} style={{ opacity: 0.7 }}>✕</span>
                </span>
              ))
            : null}
        </div>

        <div className="composer-row">
          <textarea
            ref={textRef}
            className="field"
            rows={1}
            placeholder={busy ? 'Working…' : 'Ask anything…'}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 168)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !/Mobi|Android/i.test(navigator.userAgent)) {
                e.preventDefault()
                send()
              }
            }}
          />
          {busy ? (
            <button className="send stop" onClick={stop} aria-label="Stop">
              ■
            </button>
          ) : (
            <button className="send" onClick={() => send()} disabled={!input.trim()} aria-label="Send">
              ↑
            </button>
          )}
        </div>
      </div>

      <ModelPicker
        open={picker}
        onClose={() => setPicker(false)}
        settings={settings}
        onRefresh={refreshModels}
        refreshing={refreshing}
        multi={compareOn}
        selected={compare}
        onToggle={toggleCompare}
        onPick={({ providerId, modelId }) => {
          setSettings({ ...settings, defaultProvider: providerId, defaultModel: modelId })
          setPicker(false)
        }}
      />

      <Sheet open={drawer} title="Chats" onClose={() => setDrawer(false)}>
        <button className="btn primary block" onClick={startNew} style={{ marginBottom: 12 }}>
          + New chat
        </button>
        {chats.map((c) => (
          <button
            key={c.id}
            className="card"
            onClick={() => {
              setActiveId(c.id)
              setDrawer(false)
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              borderColor: c.id === activeId ? 'var(--gold)' : 'var(--line-soft)',
            }}
          >
            <span className="grow">
              <span style={{ display: 'block', fontSize: 14.5 }}>{c.title}</span>
              <span className="tiny muted">
                {c.messages.length} messages · {new Date(c.updatedAt).toLocaleDateString()}
              </span>
            </span>
            <span
              onClick={async (e) => {
                e.stopPropagation()
                await deleteChat(c.id)
                setChats((prev) => {
                  const rest = prev.filter((x) => x.id !== c.id)
                  if (!rest.length) {
                    const fresh = newChat()
                    saveChat(fresh)
                    setActiveId(fresh.id)
                    return [fresh]
                  }
                  if (c.id === activeId) setActiveId(rest[0].id)
                  return rest
                })
              }}
              style={{ color: 'var(--danger)', padding: 6 }}
            >
              ✕
            </span>
          </button>
        ))}
      </Sheet>

      <Sheet open={optsOpen} title="Chat options" onClose={() => setOptsOpen(false)}>
        <span className="label">System prompt for this chat</span>
        <textarea
          className="field"
          rows={5}
          placeholder="Optional. Sets the assistant's standing instructions."
          value={active?.system || ''}
          onChange={(e) => patchActive({ system: e.target.value })}
        />
        <div className="hr" />
        <span className="label">Rename</span>
        <input
          className="field"
          value={active?.title || ''}
          onChange={(e) => patchActive({ title: e.target.value })}
        />
        <div className="hr" />
        <div className="stack">
          <button
            className="btn block"
            onClick={async () => {
              const body = (active?.messages || [])
                .map((m) => `## ${m.role === 'user' ? 'You' : `${m.modelLabel || m.model}`}\n\n${m.content}`)
                .join('\n\n---\n\n')
              downloadFile(`${(active?.title || 'chat').replace(/[^\w-]+/g, '-').toLowerCase()}.md`, body)
            }}
          >
            ⤓ Export as Markdown
          </button>
          <button
            className="btn block"
            onClick={async () => {
              const ok = await copyText(
                (active?.messages || [])
                  .map((m) => `${m.role === 'user' ? 'You' : m.modelLabel || 'AI'}: ${m.content}`)
                  .join('\n\n')
              )
              toast(ok ? 'Transcript copied' : 'Copy blocked by browser', ok ? 'info' : 'error')
            }}
          >
            ⧉ Copy transcript
          </button>
        </div>
        <div className="hr" />
        <div className="tiny muted">
          Chat history is stored only on this device. Messages are sent straight to the provider that owns the key you selected.
        </div>
      </Sheet>
    </div>
  )
}
