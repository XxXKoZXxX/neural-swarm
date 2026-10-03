// Line-level diff for comparing two runs. Classic LCS table — inputs here are
// agent outputs, so a few hundred lines is the realistic ceiling.

export function diffLines(before, after) {
  const a = String(before ?? '').split('\n')
  const b = String(after ?? '').split('\n')
  const n = a.length
  const m = b.length

  // Guard against pathological input on a phone.
  if (n * m > 4_000_000) {
    return [
      ...a.map((line) => ({ type: 'del', line })),
      ...b.map((line) => ({ type: 'add', line })),
    ]
  }

  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const out = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', line: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', line: a[i] })
      i++
    } else {
      out.push({ type: 'add', line: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', line: a[i++] })
  while (j < m) out.push({ type: 'add', line: b[j++] })
  return out
}

/** Collapse long unchanged runs so the phone screen shows what actually changed. */
export function compactDiff(rows, context = 3) {
  const keep = new Set()
  rows.forEach((row, idx) => {
    if (row.type !== 'same') {
      for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) keep.add(k)
    }
  })
  const out = []
  let skipping = false
  rows.forEach((row, idx) => {
    if (keep.has(idx)) {
      out.push(row)
      skipping = false
    } else if (!skipping) {
      out.push({ type: 'gap' })
      skipping = true
    }
  })
  return out
}

export function diffStats(rows) {
  return rows.reduce(
    (acc, r) => {
      if (r.type === 'add') acc.added++
      else if (r.type === 'del') acc.removed++
      return acc
    },
    { added: 0, removed: 0 }
  )
}
