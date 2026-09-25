import { useState } from 'react'
import { renderMarkdown } from '../lib/markdown.js'
import { AGENTS } from '../lib/agents.js'
import { copyText, haptic } from './ui.jsx'
import { formatTokens } from '../lib/catalog.js'

export default function AgentCard({ name, out, error, running, tokens, ms, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState(false)
  const def = AGENTS[name] || { icon: '◇', label: name, blurb: '' }
  const status = error ? 'failed' : running ? 'running' : 'done'

  return (
    <div className={`agent${running ? ' running' : ''}`}>
      <button className="agent-head" onClick={() => setOpen((v) => !v)}>
        <span className="ic">{def.icon}</span>
        <span className="nm">{def.label}</span>
        {running ? <span className="tag info">running</span> : null}
        {error ? <span className="tag bad">failed</span> : null}
        {!running && !error && tokens ? <span className="tag ok">{formatTokens(tokens)} tok</span> : null}
        {!running && ms ? <span className="tiny muted mono">{(ms / 1000).toFixed(1)}s</span> : null}
        <span className="muted">{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div className="agent-body">
          {error ? <div className="small" style={{ color: 'var(--danger)' }}>{error}</div> : null}
          {out ? renderMarkdown(out) : !error ? <span className="cursor-blink" /> : null}
          {out && !running ? (
            <button
              className="btn sm ghost"
              style={{ marginTop: 8 }}
              onClick={async () => {
                const ok = await copyText(out)
                haptic(10)
                setCopied(ok)
                setTimeout(() => setCopied(false), 1400)
              }}
            >
              {copied ? '✓ Copied' : '⧉ Copy output'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
