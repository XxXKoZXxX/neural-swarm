// Minimal Markdown renderer that returns React elements.
//
// Model output is untrusted text, so this never uses dangerouslySetInnerHTML —
// React escapes every string it renders. Covers what LLMs actually emit:
// fenced code, headings, lists, quotes, rules, inline code/bold/italic/links.

import { createElement as h } from 'react'

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]+\))/g
const SAFE_URL = /^(https?:\/\/|mailto:)/i

function inline(text, keyPrefix = 'i') {
  if (!text) return null
  const parts = String(text).split(INLINE).filter((p) => p !== '')
  return parts.map((part, i) => {
    const k = `${keyPrefix}-${i}`
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return h('code', { key: k, className: 'md-code' }, part.slice(1, -1))
    }
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return h('strong', { key: k }, part.slice(2, -2))
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return h('em', { key: k }, part.slice(1, -1))
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      const [, label, href] = link
      // Only http(s)/mailto — blocks javascript: and data: payloads.
      if (!SAFE_URL.test(href)) return h('span', { key: k }, label)
      return h('a', { key: k, href, target: '_blank', rel: 'noreferrer noopener' }, label)
    }
    return part
  })
}

export function renderMarkdown(src) {
  const text = String(src ?? '')
  if (!text) return null

  const blocks = []
  const fence = /```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g
  let last = 0
  let match

  while ((match = fence.exec(text)) !== null) {
    if (match.index > last) blocks.push({ kind: 'text', body: text.slice(last, match.index) })
    blocks.push({ kind: 'code', lang: (match[1] || '').trim(), body: match[2].replace(/\n$/, '') })
    last = match.index + match[0].length
  }
  if (last < text.length) blocks.push({ kind: 'text', body: text.slice(last) })

  return blocks.map((block, bi) => {
    if (block.kind === 'code') {
      return h(
        'div',
        { key: `b${bi}`, className: 'md-pre-wrap' },
        block.lang ? h('div', { className: 'md-lang' }, block.lang) : null,
        h('pre', { className: 'md-pre' }, h('code', null, block.body))
      )
    }
    return h('div', { key: `b${bi}`, className: 'md-text' }, ...lines(block.body, `b${bi}`))
  })
}

function lines(body, prefix) {
  const out = []
  const src = body.split('\n')
  let list = null

  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    out.push(h(Tag, { key: `${prefix}-l${out.length}`, className: 'md-list' }, ...list.items))
    list = null
  }

  src.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '')
    const key = `${prefix}-${i}`

    if (!line.trim()) {
      flush()
      return
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flush()
      const level = Math.min(heading[1].length + 2, 6)
      out.push(h(`h${level}`, { key, className: `md-h md-h${level}` }, inline(heading[2], key)))
      return
    }

    if (/^(---|___|\*\*\*)\s*$/.test(line)) {
      flush()
      out.push(h('hr', { key, className: 'md-hr' }))
      return
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flush()
      out.push(h('blockquote', { key, className: 'md-quote' }, inline(quote[1], key)))
      return
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push(h('li', { key: `${key}-li` }, inline((bullet || numbered)[1], key)))
      return
    }

    flush()
    out.push(h('p', { key, className: 'md-p' }, inline(line, key)))
  })

  flush()
  return out
}

/** First meaningful line of a message — used for chat titles and run labels. */
export function summarize(text, max = 44) {
  const clean = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return 'Untitled'
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}
