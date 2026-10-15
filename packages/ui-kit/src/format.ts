import type { Category, FeedStep } from '@sidecar/shared'

/** Token counts as the readout and the terminal show them: 950, 4.3k, 12k, 2.5M. Non-finite or negative reads 0. */
export const fmtTokens = (v: number): string => {
  const x = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
  const short = (d: number, unit: string) => `${(x / d).toFixed(1).replace(/\.0$/, '')}${unit}`
  if (x < 1000) return String(x)
  if (x < 999_950) return short(1000, 'k')
  return short(1_000_000, 'M')
}

const SUBJECT_MAX = 32

/** Card label per category: uppercase, with a friendlier word where the id reads badly. */
const CATEGORY: Partial<Record<Category, string>> = { create: 'NEW FILE', fallback: 'STEP', external: 'WEB', subagent: 'HELPER' }

const cap = (s: string): string => (s.length > SUBJECT_MAX ? `${s.slice(0, SUBJECT_MAX - 1)}…` : s)

/** A short subject from a step's techLabel: the command, the file's basename, or the tool's argument. */
export function stepSubject(techLabel: string): string {
  if (techLabel === 'UserPromptSubmit') return ''
  if (techLabel.startsWith('Bash: ')) return cap(techLabel.slice(6).trim())
  const space = techLabel.indexOf(' ')
  if (space < 0) return cap(techLabel)
  const arg = techLabel.slice(space + 1).trim()
  const looksLikePath = /^[^\s]*\/[^\s]*$/.test(arg) && !/^[a-z]+:\/\//i.test(arg)
  return cap(looksLikePath ? arg.split('/').filter(Boolean).pop() ?? arg : arg)
}

/** "CATEGORY · subject", or just the category when there is no subject. */
export function stepTitle(step: Pick<FeedStep, 'category' | 'techLabel'>): string {
  const cat = CATEGORY[step.category] ?? step.category.toUpperCase()
  const subject = stepSubject(step.techLabel)
  return subject ? `${cat} · ${subject}` : cat
}

/** Milliseconds as mm:ss; minutes keep growing past 99. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
