// Shared UI kit: sheet, chips, fields, toasts, haptics, clipboard.

import { useCallback, useEffect, useRef, useState } from 'react'

export const haptic = (ms = 12) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}

export function Sheet({ open, title, onClose, children, right }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          {right}
          <button className="btn sm ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  )
}

export function Field({ label, hint, ...props }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      {label ? <span className="label">{label}</span> : null}
      <input className="field" {...props} />
      {hint ? <div className="tiny muted" style={{ marginTop: 5 }}>{hint}</div> : null}
    </label>
  )
}

export function Chip({ on, children, ...rest }) {
  return (
    <button className={`chip${on ? ' on' : ''}`} {...rest}>
      {children}
    </button>
  )
}

export function useToasts() {
  const [items, setItems] = useState([])
  const idRef = useRef(0)
  const push = useCallback((text, kind = 'info') => {
    const id = ++idRef.current
    setItems((prev) => [...prev, { id, text, kind }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3200)
  }, [])
  const view = (
    <div style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(var(--tab-h) + var(--safe-b) + 14px)', zIndex: 80, pointerEvents: 'none' }}>
      {items.map((t) => (
        <div
          key={t.id}
          className="card"
          style={{
            marginTop: 8,
            padding: '10px 12px',
            fontSize: 13,
            borderColor: t.kind === 'error' ? 'rgba(226,104,95,.45)' : 'var(--line)',
            background: t.kind === 'error' ? 'rgba(60,20,18,.97)' : 'rgba(28,20,23,.97)',
            boxShadow: '0 10px 30px rgba(0,0,0,.5)',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
  return { push, view }
}

export async function copyText(text) {
  const value = String(text ?? '')
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    // Clipboard API needs a secure context; fall back to a temp selection.
    try {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function downloadFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
