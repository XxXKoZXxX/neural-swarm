// Neural Swarm app shell: tab navigation, settings, lock, share target,
// install prompt and model sync.

import { useCallback, useEffect, useMemo, useState } from 'react'
import ChatScreen from './screens/ChatScreen.jsx'
import SwarmScreen from './screens/SwarmScreen.jsx'
import FlowScreen from './screens/FlowScreen.jsx'
import VaultScreen from './screens/VaultScreen.jsx'
import RunsScreen from './screens/RunsScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'
import { useToasts, haptic } from './components/ui.jsx'
import { PROVIDERS } from './lib/catalog.js'
import { listModels } from './lib/providers.js'
import { loadSettings, saveSettings, loadDiscovered, saveDiscovered } from './lib/store.js'

const TABS = [
  { id: 'chat', label: 'Chat', icon: '◈' },
  { id: 'swarm', label: 'Swarm', icon: '⬡' },
  { id: 'flow', label: 'Flow', icon: '🕸' },
  { id: 'vault', label: 'Vault', icon: '🗝' },
  { id: 'runs', label: 'Runs', icon: '↺' },
  { id: 'settings', label: 'Setup', icon: '⚙' },
]

export default function App() {
  const [settings, setSettingsState] = useState(null)
  const [tab, setTab] = useState('chat')
  const [unlocked, setUnlocked] = useState(false)
  const [pinTry, setPinTry] = useState('')
  const [pinError, setPinError] = useState(false)
  const [chatPrefill, setChatPrefill] = useState('')
  const [swarmSeed, setSwarmSeed] = useState(null)
  const [runFocus, setRunFocus] = useState(null)
  const [installEvent, setInstallEvent] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const { push, view } = useToasts()

  // ---- settings load
  useEffect(() => {
    let alive = true
    ;(async () => {
      const saved = await loadSettings()
      const discovered = await loadDiscovered()
      if (!alive) return
      setSettingsState({ ...saved, discovered })
      setUnlocked(!saved.pin)
    })()
    return () => {
      alive = false
    }
  }, [])

  const setSettings = useCallback((next) => {
    setSettingsState(next)
    saveSettings(next)
  }, [])

  // ---- install prompt capture
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setInstallEvent(e)
    }
    const onInstalled = () => {
      setInstallEvent(null)
      push('Installed — launch it from your home screen any time')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [push])

  // ---- share target + shortcuts (?go=swarm, shared text from other apps)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const go = params.get('go')
    if (go && TABS.some((t) => t.id === go)) setTab(go)

    const shared = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join('\n\n')
    if (shared) {
      if (go === 'swarm') setSwarmSeed({ goal: shared })
      else setChatPrefill(shared)
      push('Shared content loaded')
    }
    if (go || shared) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
    }
  }, [push])

  const refreshModels = useCallback(async () => {
    setRefreshing(true)
    push('Pulling live model lists…')
    const next = { ...(settings?.discovered || {}) }
    let found = 0
    for (const provider of PROVIDERS) {
      const needsKey = provider.requiresKey !== false
      if (needsKey && !settings?.keys?.[provider.id]) continue
      const base = settings?.baseOverrides?.[provider.id]
      try {
        const ids = await listModels({
          provider: base ? { ...provider, baseUrl: base } : provider,
          key: settings?.keys?.[provider.id] || '',
        })
        if (ids.length) {
          next[provider.id] = ids
          found += ids.length
        }
      } catch {
        /* a dead provider should not stop the sync */
      }
    }
    setSettings({ ...settings, discovered: next })
    saveDiscovered(next)
    setRefreshing(false)
    push(found ? `Synced ${found} models from your providers` : 'No new models found — check your keys', found ? 'info' : 'error')
  }, [settings, setSettings, push])

  const install = useCallback(async () => {
    if (!installEvent) return
    installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice?.outcome === 'accepted') push('Installing…')
    setInstallEvent(null)
  }, [installEvent, push])

  // A keyless local provider only counts once it has actually answered with a
  // model list — otherwise a fresh install looks configured and never prompts
  // for the first key.
  const configuredCount = useMemo(
    () =>
      settings
        ? PROVIDERS.filter(
            (p) => settings.keys?.[p.id] || (p.requiresKey === false && (settings.discovered?.[p.id]?.length || 0) > 0)
          ).length
        : 0,
    [settings]
  )

  if (!settings) {
    return <div className="app"><div className="scroll center" style={{ paddingTop: '40dvh' }}><span className="brand">Neural Swarm</span></div></div>
  }

  // ---- lock screen
  if (!unlocked) {
    const submit = () => {
      if (pinTry === settings.pin) {
        setUnlocked(true)
        haptic(12)
      } else {
        setPinError(true)
        setPinTry('')
        haptic(45)
      }
    }
    return (
      <div className="app">
        <div className="scroll" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div style={{ width: '100%', maxWidth: 320 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⬡</div>
            <div className="brand" style={{ marginBottom: 6 }}>Neural Swarm</div>
            <div className="small muted" style={{ marginBottom: 22 }}>Enter your PIN</div>
            <input
              className="field mono center"
              style={{ letterSpacing: '0.5em', fontSize: 22, marginBottom: 12 }}
              type="password"
              inputMode="numeric"
              autoFocus
              value={pinTry}
              onChange={(e) => {
                setPinError(false)
                setPinTry(e.target.value.replace(/\D/g, '').slice(0, 8))
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            {pinError ? <div className="small" style={{ color: 'var(--danger)', marginBottom: 10 }}>Wrong PIN</div> : null}
            <button className="btn primary block" onClick={submit}>Unlock</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <div className="app-body">
        {tab === 'chat' ? (
          <ChatScreen
            settings={settings}
            setSettings={setSettings}
            toast={push}
            refreshModels={refreshModels}
            refreshing={refreshing}
            prefill={chatPrefill}
            clearPrefill={() => setChatPrefill('')}
          />
        ) : null}

        {tab === 'swarm' ? (
          <SwarmScreen
            settings={settings}
            setSettings={setSettings}
            toast={push}
            refreshModels={refreshModels}
            refreshing={refreshing}
            seed={swarmSeed}
            clearSeed={() => setSwarmSeed(null)}
            onOpenRun={(payload) => {
              if (payload?.agents) setSwarmSeed(payload)
              setRunFocus(null)
              setTab('runs')
            }}
          />
        ) : null}

        {tab === 'flow' ? (
          <FlowScreen
            settings={settings}
            toast={push}
            prefill={swarmSeed?.goal || ''}
            clearPrefill={() => setSwarmSeed(null)}
            onOpenRun={({ agents, goal }) => {
              setSwarmSeed({ agents, goal, manual: true })
              setTab('swarm')
            }}
          />
        ) : null}

        {tab === 'vault' ? (
          <VaultScreen
            toast={push}
            sendToChat={(body) => {
              setChatPrefill(body)
              setTab('chat')
            }}
            sendToSwarm={(payload) => {
              setSwarmSeed(payload)
              setTab('swarm')
            }}
          />
        ) : null}

        {tab === 'runs' ? (
          <RunsScreen
            toast={push}
            focusId={runFocus}
            seedSwarm={(payload) => {
              setSwarmSeed(payload)
              setTab('swarm')
            }}
          />
        ) : null}

        {tab === 'settings' ? (
          <SettingsScreen
            settings={settings}
            setSettings={setSettings}
            toast={push}
            refreshModels={refreshModels}
            refreshing={refreshing}
            canInstall={Boolean(installEvent)}
            onInstall={installEvent ? install : null}
          />
        ) : null}
      </div>

      {!configuredCount && tab !== 'settings' ? (
        <button
          onClick={() => setTab('settings')}
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 'calc(var(--tab-h) + var(--safe-b) + 10px)',
            zIndex: 40,
            textAlign: 'left',
          }}
          className="card gold"
        >
          <div className="row">
            <span style={{ fontSize: 18 }}>🔑</span>
            <span className="grow">
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>Add a model key to start</span>
              <span className="tiny muted">One key unlocks everything — OpenRouter is the quickest.</span>
            </span>
            <span className="muted">›</span>
          </div>
        </button>
      ) : null}

      {view}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' on' : ''}`}
            onClick={() => {
              haptic(6)
              setTab(t.id)
            }}
          >
            <span className="ic">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
