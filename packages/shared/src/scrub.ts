import type { SidecarEvent } from './events'

export const REDACTED = '[REDACTED]'

const TOKEN_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /xox[abposr]-[A-Za-z0-9-]{10,}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
]
// `"?` lets the header match JSON-shaped headers like {"Authorization":"Bearer …"}
const HEADER_PATTERN = /\b(authorization|cookie|set-cookie)(["']?\s*:\s*["']?)[^\n"']+/gi
// the lookbehind (not \b) also matches after an underscore, e.g. DB_PASSWORD=
const PAIR_PATTERN = /(?<![A-Za-z0-9])(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)(\s*[=:]\s*)(["']?)[^\s"'&,;]+/gi
// shell-style env assignments whose name says it holds a credential: MY_TOKEN=…, STRIPE_SECRET_KEY=…
const ENV_ASSIGN_PATTERN = /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD|CREDENTIALS?))(\s*=\s*)(["']?)[^\s"']+/g
const URL_CREDENTIALS_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi
const CURL_USER_PATTERN = /(\s(?:-u|--user)\s+[^\s:]+:)\S+/g

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function scrubText(s: string, extra: string[] = []): string {
  let out = s
  for (const value of extra) {
    if (value.length >= 6) out = out.replace(new RegExp(escapeRegExp(value), 'g'), REDACTED)
  }
  for (const re of TOKEN_PATTERNS) out = out.replace(re, REDACTED)
  out = out.replace(HEADER_PATTERN, `$1$2${REDACTED}`)
  out = out.replace(ENV_ASSIGN_PATTERN, `$1$2$3${REDACTED}`)
  out = out.replace(PAIR_PATTERN, `$1$2$3${REDACTED}`)
  out = out.replace(URL_CREDENTIALS_PATTERN, `$1${REDACTED}@`)
  out = out.replace(CURL_USER_PATTERN, `$1${REDACTED}`)
  return out
}

export function scrubDeep<T>(v: T, extra: string[] = []): T {
  if (typeof v === 'string') return scrubText(v, extra) as T
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x, extra)) as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = scrubDeep(x, extra)
    return out as T
  }
  return v
}

const MAX_STRING = 1000
const MAX_PROMPT = 4000

function truncateStrings(v: unknown): unknown {
  if (typeof v === 'string') {
    return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}…[truncated ${v.length - MAX_STRING} chars]` : v
  }
  if (Array.isArray(v)) return v.map(truncateStrings)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = truncateStrings(x)
    return out
  }
  return v
}

export function limitSize(v: unknown, maxChars = 4096): unknown {
  if (v === undefined) return v
  const cut = truncateStrings(v)
  const json = JSON.stringify(cut) ?? ''
  if (json.length <= maxChars) return cut
  return { truncated: true, preview: json.slice(0, maxChars - 200) }
}

export function scrubEvent(e: SidecarEvent, extra: string[] = []): SidecarEvent {
  const out: SidecarEvent = { ...e }
  if (e.tool) {
    out.tool = { ...e.tool, input: limitSize(scrubDeep(e.tool.input, extra)) }
    if (e.tool.output !== undefined) out.tool.output = limitSize(scrubDeep(e.tool.output, extra))
  }
  if (e.prompt !== undefined) {
    const p = scrubText(e.prompt, extra)
    out.prompt = p.length > MAX_PROMPT ? `${p.slice(0, MAX_PROMPT)}…[truncated ${p.length - MAX_PROMPT} chars]` : p
  }
  if (e.raw !== undefined) out.raw = limitSize(scrubDeep(e.raw, extra))
  return out
}
