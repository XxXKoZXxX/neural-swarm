// One chat message, with markdown, copy, retry and per-model labelling.

import { useState } from 'react'
import { renderMarkdown } from '../lib/markdown.js'
import { formatCost, formatTokens } from '../lib/catalog.js'
import { copyText, haptic } from './ui.jsx'

export default function Message({ msg, onRetry, onDelete, streaming }) {
  const [copied, setCopied] = useState(false)

  const doCopy = async () => {
    const ok = await copyText(msg.content)
    haptic(10)
    setCopied(ok)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`msg ${msg.role === 'user' ? 'user' : 'assistant'}`}>
      <div className="who">
        {msg.role === 'user' ? (
          <span>You</span>
        ) : (
          <>
            <span style={{ color: 'var(--gold)' }}>{msg.providerShort || 'AI'}</span>
            <span>{msg.modelLabel || msg.model || 'model'}</span>
            {msg.usage ? (
              <span className="muted">
                · {formatTokens((msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0))} tok · {formatCost(msg.cost)}
              </span>
            ) : null}
          </>
        )}
      </div>

      {msg.error ? (
        <div className="bubble" style={{ borderColor: 'rgba(226,104,95,.4)', color: 'var(--danger)' }}>
          {msg.error}
        </div>
      ) : (
        <div className="bubble">
          {renderMarkdown(msg.content)}
          {streaming && !msg.content ? <span className="cursor-blink" /> : null}
          {streaming && msg.content ? <span className="cursor-blink" /> : null}
        </div>
      )}

      <div className="row" style={{ marginTop: 6, gap: 6 }}>
        {!streaming && msg.content ? (
          <button className="btn sm ghost" onClick={doCopy}>
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
        ) : null}
        {!streaming && onRetry ? (
          <button className="btn sm ghost" onClick={() => onRetry(msg)}>
            ↻ Retry
          </button>
        ) : null}
        {!streaming && onDelete && msg.role === 'assistant' ? (
          <button className="btn sm ghost danger" onClick={() => onDelete(msg)}>
            Discard
          </button>
        ) : null}
      </div>
    </div>
  )
}
