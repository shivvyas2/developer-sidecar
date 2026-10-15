/**
 * Terminal renderer for the drafting-instrument language (spec section 7).
 *
 * Pure and deterministic: `(model, columns, rows) -> Line[]`, no DOM, no Node
 * APIs. Widths are counted in code points and every character, box-drawing
 * characters included, is assumed to be one column wide.
 *
 * Every box starts at column 1 and ends at column `columns - 2`, so the right
 * borders of the readout and the card line up exactly.
 */
import { lineWidth, type Line, type Seg, type TextModel, type TextStep, type Tone } from './model'

export { lineWidth }
export type { Line, Seg, TextModel, TextStep, Tone }

const MIN_COLUMNS = 40
const DEFAULT_ROWS = 12
const FIXED_ROWS = 5 // header, 3-line readout, footer

const w = (s: string) => [...s].length
const cut = (s: string, max: number): string => {
  if (max <= 0) return ''
  if (w(s) <= max) return s
  return max === 1 ? '…' : [...s].slice(0, max - 1).join('') + '…'
}
const sp = (n: number) => ' '.repeat(Math.max(0, n))
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const seg = (text: string, tone?: Tone): Seg => (tone ? { text, tone } : { text })
const pad3 = (n: number) => String(Math.max(0, Math.trunc(n))).padStart(3, '0')
const tabOf = (n: number) => `╱${pad3(n)}╲`

const fmtTok = (n: number): string => {
  if (n < 1000) return String(Math.max(0, Math.trunc(n)))
  const k = n / 1000
  return (k < 100 ? k.toFixed(1) : String(Math.round(k))) + 'k'
}

/** Word wrap, hard-splitting words longer than `width`. */
function wrap(text: string, width: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const word of clean(text).split(' ')) {
    if (!word) continue
    let rest = [...word]
    while (rest.length > width) {
      if (cur) { out.push(cur); cur = '' }
      out.push(rest.slice(0, width).join(''))
      rest = rest.slice(width)
    }
    const piece = rest.join('')
    if (!cur) cur = piece
    else if (w(cur) + 1 + rest.length <= width) cur += ' ' + piece
    else { out.push(cur); cur = piece }
  }
  if (cur) out.push(cur)
  return out
}

/** Pad a content line to `width` and fit it to exactly `width` columns. */
function fit(line: Line, width: number): Line {
  return [...line, seg(sp(width - lineWidth(line)))]
}

function ellipsize(line: Line, width: number): Line {
  if (lineWidth(line) < width) return [...line, seg('…')]
  const out = line.map((s) => ({ ...s }))
  for (let i = out.length - 1; i >= 0; i--) {
    const chars = [...out[i]!.text]
    if (chars.length) { chars[chars.length - 1] = '…'; out[i]!.text = chars.join(''); break }
  }
  return out
}

function markOf(status: TextStep['status']): Seg {
  switch (status) {
    case 'running': return seg('●', 'accent')
    case 'failed': return seg('✕', 'accent')
    case 'interrupted': return seg('○', 'dim')
    default: return seg('■', 'dim')
  }
}

function header(m: TextModel, cols: number): Line {
  const off = !!m.offline || !m.live
  const right: Line = off ? [seg('OFFLINE', 'dim')] : [seg('●', 'accent'), seg('LIVE', 'bold')]
  const rw = lineWidth(right)
  const left = cut(' DEVELOPER SIDECAR · ' + clean(m.project).toUpperCase(), Math.max(0, cols - rw - 2))
  return [seg(left, 'bold'), seg(sp(cols - w(left) - rw - 1)), ...right, seg(' ')]
}

function readout(m: TextModel, B: number): Line[] {
  const labels = ['STEP', 'FILES', 'TOKENS', 'ELAPSED']
  const vals = [pad3(m.readout.step), String(Math.max(0, m.readout.files)).padStart(2, '0'),
    fmtTok(m.readout.tokens), clean(m.readout.elapsed)]
  const c = [8, 7, 8, 0]
  c[3] = B - 5 - c[0]! - c[1]! - c[2]!
  const top: Line = [seg(' ┌')]
  const mid: Line = [seg(' │')]
  const bot: Line = [seg(' └')]
  labels.forEach((lab, i) => {
    const cw = c[i]!
    const l = ` ${lab} `
    top.push(seg(l + '─'.repeat(cw - l.length)))
    const v = cut(vals[i]!, cw - 2)
    mid.push(seg(' '), seg(v, 'bold'), seg(sp(cw - 1 - w(v))))
    bot.push(seg('─'.repeat(cw)))
    const last = i === labels.length - 1
    top.push(seg(last ? '┐' : '┬'))
    mid.push(seg('│'))
    bot.push(seg(last ? '┘' : '┴'))
  })
  return [top, mid, bot]
}

function card(s: TextStep, B: number, budget: number): Line[] {
  const iw = B - 4
  const boxed = (content: Line): Line => [seg(' │ '), ...fit(content, iw), seg(' │')]
  const tab = tabOf(s.num)
  const tabLine: Line = [seg(' '), seg(tab, s.status === 'running' ? 'inverse' : 'bold'),
    seg('_'.repeat(Math.max(0, B - w(tab))))]
  const title = cut(clean(s.title).toUpperCase(), iw - 2)
  const cap = s.caption ? cut(' · ' + clean(s.caption), iw - 2 - w(title)) : ''
  const titleLine = boxed([seg(title, 'bold'), seg(cap), seg(sp(iw - w(title) - w(cap) - 1)), markOf(s.status)])

  const body: Line[] = []
  if (s.plain) for (const t of wrap(s.plain, iw)) body.push([seg(t)])
  if (s.why) wrap(s.why, iw - 5).forEach((t, i) => body.push([seg(i === 0 ? 'WHY  ' : sp(5), 'dim'), seg(t, 'dim')]))
  if (s.chip) body.push([seg(cut(`[${clean(s.chip)}]`, iw))])

  const keep = Math.max(0, budget - 3)
  let shown = body.slice(0, keep)
  if (body.length > keep && shown.length) shown[shown.length - 1] = ellipsize(shown[shown.length - 1]!, iw)
  const bottom: Line = [seg(' └' + '─'.repeat(B - 2) + '┘')]
  return [tabLine, titleLine, ...shown.map(boxed), bottom]
}

function collapsed(s: TextStep, B: number): Line {
  const tab = tabOf(s.num)
  const tw = Math.max(0, B - w(tab) - 4)
  const text = cut(clean(s.title).toUpperCase() + (s.caption ? ' · ' + clean(s.caption) : ''), tw)
  return [seg(' '), seg(tab, 'bold'), seg('  '), seg(text), seg(sp(tw - w(text) + 1)), markOf(s.status)]
}

function footer(m: TextModel, B: number): Line {
  const label = cut(` ${m.steps.length} STEPS · src/ ${Math.max(0, m.readout.files)} FILES`, B)
  const n = B - w(label)
  return [seg(' '), seg('▕▏'.repeat(Math.floor(n / 2)) + (n % 2 ? '▕' : ''), 'dim'), seg(label)]
}

export function renderText(m: TextModel, columns: number, rows: number = DEFAULT_ROWS): Line[] {
  const cols = Math.trunc(columns)
  if (cols < MIN_COLUMNS) return [[seg(cut(`SIDECAR · STEP ${pad3(m.readout.step)}`, Math.max(0, cols)))]]
  const B = cols - 2
  const out: Line[] = [header(m, cols), ...readout(m, B)]
  const budget = Math.max(0, Math.trunc(rows) - FIXED_ROWS)

  if (m.offline) {
    out.push([seg(' '), seg(' OFFLINE ', 'inverse'), seg(' retrying…', 'dim')])
  } else if (m.steps.length === 0) {
    out.push([seg(' Waiting for Claude to do something…', 'dim')])
    return out.map((l) => trimTo(l, cols))
  } else if (budget >= 3) {
    const latest = m.steps[m.steps.length - 1]!
    const earlier = m.steps.slice(0, -1).reverse()
    const cardBudget = budget - Math.min(earlier.length, 1)
    const lines = card(latest, B, Math.max(3, cardBudget))
    out.push(...lines)
    for (const s of earlier.slice(0, Math.max(0, budget - lines.length))) out.push(collapsed(s, B))
  }
  out.push(footer(m, B))
  return out.map((l) => trimTo(l, cols))
}

/** Last line of defence: no line is ever wider than `cols`. */
function trimTo(l: Line, cols: number): Line {
  let left = cols
  const out: Line = []
  for (const s of l) {
    const t = [...s.text]
    if (t.length <= left) { out.push(s); left -= t.length } else { if (left > 0) out.push({ ...s, text: t.slice(0, left).join('') }); left = 0; break }
  }
  return out
}
