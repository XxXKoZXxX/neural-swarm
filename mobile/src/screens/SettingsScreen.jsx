// Settings — providers, keys, defaults, lock, install and data control.

import { useRef, useState } from 'react'
import { Sheet, haptic, copyText } from '../components/ui.jsx'
import { PROVIDERS, modelsFor } from '../lib/catalog.js'
import { listModels } from '../lib/providers.js'
import { store, listChats, listRuns, listVault, listFlows, loadDiscovered, saveDiscovered } from '../lib/store.js'

export default function SettingsScreen({ settings, setSettings, toast, refreshModels, refreshing, onInstall, canInstall }) {
  const [reveal, setReveal] = useState({})
  const [testing, setTesting] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [pinSheet, setPinSheet] = useState(false)
  const [pinDraft, setPinDraft] = useState('')
  const [includeKeys, setIncludeKeys] = useState(false)
  const fileRef = useRef(null)

  const setKey = (id, value) => setSettings({ ...settings, keys: { ...settings.keys, [id]: value.trim() } })
  const setBase = (id, value) => setSettings({ ...settings, baseOverrides: { ...settings.baseOverrides, [id]: value.trim() } })

  const test = async (provider) => {
    setTesting(provider.id)
    setToastMsg('')
    try {
      const ids = await listModels({ provider: effective(provider), key: settings.keys?.[provider.id] || '' })
      if (ids.length) {
        toast(`${provider.label}: ${ids.length} models reachable`)
        const next = { ...(settings.discovered || {}), [provider.id]: ids }
        setSettings({ ...settings, discovered: next })
        saveDiscovered(next)
      } else {
        toast(`${provider.label} did not return a model list. Check the key${provider.local ? ' and that the server is running' : ''}.`, 'error')
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setTesting('')
      haptic(10)
    }
  }

  const effective = (p) => (settings.baseOverrides?.[p.id] ? { ...p, baseUrl: settings.baseOverrides[p.id] } : p)

  const exportAll = async () => {
    const payload = {
      app: 'neural-swarm',
      version: 1,
      exportedAt: new Date().toISOString(),
      chats: await listChats(),
      runs: await listRuns(),
      vault: await listVault(),
      flows: await listFlows(),
      settings: includeKeys ? settings : { ...settings, keys: {} },
    }
    const text = JSON.stringify(payload, null, 2)
    if (typeof navigator.share === 'function' && navigator.canShare?.({ text })) {
      try {
        await navigator.share({ title: 'Neural Swarm export', text })
        return
      } catch {
        /* fall through to copy */
      }
    }
    const ok = await copyText(text)
    toast(ok ? 'Export copied to clipboard' : 'Copy blocked — try Download instead', ok ? 'info' : 'error')
  }

  const importAll = async (file) => {
    try {
      const data = JSON.parse(await file.text())
      let count = 0
      for (const [storeName, rows] of [
        ['chats', data.chats],
        ['runs', data.runs],
        ['vault', data.vault],
        ['flows', data.flows],
      ]) {
        for (const row of rows || []) {
          await store.put(storeName, row)
          count++
        }
      }
      if (data.settings) {
        setSettings({
          ...settings,
          ...data.settings,
          id: settings.id,
          keys: { ...settings.keys, ...(data.settings.keys || {}) },
        })
      }
      toast(`Imported ${count} records`)
    } catch (err) {
      toast(`Import failed: ${err.message}`, 'error')
    }
  }

  const configured = PROVIDERS.filter(
    (p) => settings.keys?.[p.id] || (p.requiresKey === false && (settings.discovered?.[p.id]?.length || 0) > 0)
  )

  return (
    <div className="screen">
      <div className="topbar">
        <div className="grow">
          <div className="brand">Settings</div>
          <div className="sub">{configured.length} of {PROVIDERS.length} providers ready</div>
        </div>
        <button className="btn sm ghost" onClick={refreshModels} disabled={refreshing}>
          {refreshing ? '…' : '↻ Sync models'}
        </button>
      </div>

      <div className="scroll">
        {!configured.length ? (
          <div className="card gold">
            <div className="card-title">Start here</div>
            <div className="small">
              Add at least one API key below. OpenRouter is the fastest path — one key unlocks Claude, GPT, Gemini, Grok and
              open-weight models. Keys stay on this device and are only ever sent to the provider that owns them.
            </div>
          </div>
        ) : null}

        {onInstall || canInstall ? (
          <div className="card gold">
            <div className="card-title">Install the app</div>
            {canInstall ? (
              <button className="btn primary block" onClick={onInstall}>
                ⤓ Install to home screen
              </button>
            ) : (
              <div className="small dim">
                Open this page in Chrome, tap the ⋮ menu, then <b>Add to Home screen</b> (or <b>Install app</b>). Once installed it
                opens full-screen from your launcher like any other app.
              </div>
            )}
          </div>
        ) : null}

        <div className="card">
          <div className="card-title">Defaults</div>
          <span className="label">Max output tokens per call</span>
          <input
            className="field mono"
            type="number"
            min="256"
            max="128000"
            value={settings.maxTokens}
            onChange={(e) => setSettings({ ...settings, maxTokens: Number(e.target.value) || 8192 })}
            style={{ marginBottom: 12 }}
          />
          <span className="label">Agents per swarm run</span>
          <input
            className="field mono"
            type="number"
            min="2"
            max="10"
            value={settings.maxAgents}
            onChange={(e) => setSettings({ ...settings, maxAgents: Math.min(10, Math.max(2, Number(e.target.value) || 6)) })}
          />
        </div>

        <div className="card">
          <div className="card-title">Providers</div>
          {PROVIDERS.map((p) => {
            const hasKey = Boolean(settings.keys?.[p.id])
            return (
              <div key={p.id} style={{ marginBottom: 18 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="tag">{p.short}</span>
                  <span className="small grow">{p.label}</span>
                  {p.local ? <span className="tag info">no key</span> : hasKey ? <span className="tag ok">set</span> : null}
                </div>

                {p.note ? <div className="tiny muted" style={{ marginBottom: 7 }}>{p.note}</div> : null}

                {p.requiresKey === false ? null : (
                  <div className="row" style={{ gap: 6, marginBottom: 7 }}>
                    <input
                      className="field mono"
                      type={reveal[p.id] ? 'text' : 'password'}
                      placeholder={`${p.label} API key`}
                      value={settings.keys?.[p.id] || ''}
                      onChange={(e) => setKey(p.id, e.target.value)}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    <button className="btn sm ghost" onClick={() => setReveal((r) => ({ ...r, [p.id]: !r[p.id] }))}>
                      {reveal[p.id] ? '🙈' : '👁'}
                    </button>
                  </div>
                )}

                {p.editableBase ? (
                  <input
                    className="field mono"
                    placeholder="Base URL (http://host:port/v1)"
                    value={settings.baseOverrides?.[p.id] ?? p.baseUrl}
                    onChange={(e) => setBase(p.id, e.target.value)}
                    style={{ marginBottom: 7 }}
                  />
                ) : null}

                <div className="row wrap" style={{ gap: 6 }}>
                  <button className="btn sm ghost" onClick={() => test(p)} disabled={testing === p.id}>
                    {testing === p.id ? 'Testing…' : '⚡ Test'}
                  </button>
                  {p.keyUrl ? (
                    <a className="btn sm ghost" href={p.keyUrl} target="_blank" rel="noreferrer noopener">
                      Get key ↗
                    </a>
                  ) : null}
                  <span className="tiny muted mono">
                    {modelsFor(p, settings.discovered).length} models
                    {settings.discovered?.[p.id] ? ' · live' : ' · curated'}
                  </span>
                </div>
                <div className="hr" />
              </div>
            )
          })}
        </div>

        <div className="card">
          <div className="card-title">Lock</div>
          <div className="small dim" style={{ marginBottom: 10 }}>
            {settings.pin
              ? 'A PIN is set. The app will ask for it on open.'
              : 'Optional. Stops someone borrowing your phone from spending your API credit.'}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => setPinSheet(true)}>
              {settings.pin ? 'Change PIN' : 'Set PIN'}
            </button>
            {settings.pin ? (
              <button
                className="btn sm ghost danger"
                onClick={() => {
                  setSettings({ ...settings, pin: '' })
                  toast('PIN removed')
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Data</div>
          <div className="small dim" style={{ marginBottom: 10 }}>
            Everything lives on this device. Nothing is uploaded anywhere except the prompts you send to your chosen provider.
          </div>
          <label className="row small" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={includeKeys} onChange={(e) => setIncludeKeys(e.target.checked)} />
            Include API keys in the export
          </label>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn sm" onClick={exportAll}>
              ⤓ Export data
            </button>
            <button className="btn sm" onClick={() => fileRef.current?.click()}>
              ⤒ Import data
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importAll(f)
                e.target.value = ''
              }}
            />
            <button
              className="btn sm ghost danger"
              onClick={async () => {
                if (!confirm('Erase all chats, runs, vault entries and flows on this device?')) return
                await store.clearAll()
                toast('All local data erased')
                setTimeout(() => location.reload(), 700)
              }}
            >
              Erase everything
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-title">About</div>
          <div className="small dim">
            Neural Swarm for Android — the standalone app for the Neural Swarm agent platform. Ten specialized agents, Prompt
            Forge, Vault, Flow builder and the Overseer, all running against whichever model you pick.
          </div>
          <div className="hr" />
          <div className="row wrap">
            <span className="tag mono">v1.0.0</span>
            <span className="tag mono">{loadDiscovered ? 'IndexedDB' : 'storage'}</span>
            <span className="tag mono">BYOK</span>
          </div>
          {toastMsg ? <div className="tiny muted" style={{ marginTop: 8 }}>{toastMsg}</div> : null}
        </div>
        <div style={{ height: 8 }} />
      </div>

      <Sheet open={pinSheet} title="Set PIN" onClose={() => setPinSheet(false)}>
        <span className="label">4–8 digits</span>
        <input
          className="field mono"
          inputMode="numeric"
          type="password"
          value={pinDraft}
          onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="••••"
          style={{ marginBottom: 12 }}
        />
        <button
          className="btn primary block"
          disabled={pinDraft.length < 4}
          onClick={() => {
            setSettings({ ...settings, pin: pinDraft })
            setPinDraft('')
            setPinSheet(false)
            toast('PIN set')
          }}
        >
          Save PIN
        </button>
      </Sheet>
    </div>
  )
}
