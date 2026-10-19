/**
 * Developer Sidecar inside Claude Code (spec §7): pane, status line, band, toasts and /sidecar.
 * Capture stays with the classic hooks; this module only reads the local server.
 * Every helper that takes `$` is a top-level function: the engine's validator requires it.
 */
import type { Attention, ExplainerState, FeedStep } from '@sidecar/shared'
import { renderText, type Line, type Tone } from '@sidecar/ui-kit'
import { due, FAST_MS, newCadence, recordPoll, type Cadence } from './cadence'
import { HELP, parseCommand } from './commands'
import type { Engine, On, RenderEvent } from './engine'
import { bandLine, basename, emptyState, explainerPrint, plain, readoutOf, statusLine, stepsPrint, textModel, workstationUrl, type ModState } from './model'
import { paneScene } from './scene'
import { freshMemory, milestones, type ToastMemory } from './toasts'

const PANE = 'sidecar'
const ANIM_MS = 125 // up to 8 frames a second while a scene plays
const START_AFTER_OFFLINE_POLLS = 3
const FETCH_TIMEOUT_MS = 3_000
const ATTENTION = new Set<string>(['working', 'permission', 'idle', 'done'] satisfies Attention[])
const TONE: Record<Tone, Record<string, unknown>> = {
  ink: {}, dim: { dimColor: true }, accent: { color: 'red' }, inverse: { inverse: true }, bold: { bold: true },
}

let state: ModState = emptyState()
let token = ''
let sessionId = ''
let cadence: Cadence = newCadence(0)
let memory: ToastMemory = freshMemory()
/** null until the first publish, so a new session always sets (or clears) the status line. */
let lastStatus: string | undefined | null = null
let latest = { id: '', at: 0 }
let muted = false
let bandHidden = false
let busy = false
let offlinePolls = 0
let startedServer = false
let pollTimer: { cancel(): void } | undefined
let animTimer: { cancel(): void } | undefined
let animTicks = 0
/** The server's revision of the steps last fetched in full, and their print. */
let rev = ''
let stepsSeen = ''

/** A new conversation (the first start, a /clear, a resume): forget what was shown for the last one. */
function resetSession(id: string, now: number): void {
  sessionId = id
  state = { ...emptyState(), port: state.port, project: state.project }
  cadence = newCadence(now)
  memory = freshMemory()
  lastStatus = null
  latest = { id: '', at: 0 }
  muted = false
  bandHidden = false
  offlinePolls = 0
  startedServer = false
  rev = ''
  stepsSeen = ''
}

async function locate($: Engine): Promise<void> {
  const ran = await $.process.run(['node', `${$.plugin.root}/dist/locate.cjs`], { timeoutMs: 5_000 })
  const found = JSON.parse(ran.stdout || '{}') as { port?: number; token?: string | null }
  if (typeof found.port === 'number') state = { ...state, port: found.port }
  token = found.token ?? ''
}

/** A fetch has no timeout of its own: a server that accepts and never answers must not wedge polling. */
async function within<T>($: Engine, work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([work, $.clock.sleep(ms).then((): never => { throw new Error('timed out') })])
}

async function get<T>($: Engine, path: string): Promise<T> {
  const res = await within($, $.http.fetch(`http://127.0.0.1:${state.port}${path}`, { headers: { 'x-sidecar-token': token } }), FETCH_TIMEOUT_MS)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.text) as T
}

function header(res: { headers: Record<string, string> }, name: string): string {
  for (const [k, v] of Object.entries(res.headers ?? {})) if (k.toLowerCase() === name) return v
  return ''
}

/** The session's steps (null when the server says they are unchanged since `rev`) and what it waits on. */
async function fetchSteps($: Engine): Promise<{ steps: FeedStep[] | null; attention?: Attention }> {
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/steps${rev ? `?rev=${encodeURIComponent(rev)}` : ''}`
  const res = await within($, $.http.fetch(`http://127.0.0.1:${state.port}${path}`, { headers: { 'x-sidecar-token': token } }), FETCH_TIMEOUT_MS)
  const said = header(res, 'x-sidecar-attention')
  const attention = ATTENTION.has(said) ? { attention: said as Attention } : {}
  if (res.status === 304) return { steps: null, ...attention }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  rev = header(res, 'x-sidecar-rev')
  return { steps: JSON.parse(res.text) as FeedStep[], ...attention }
}

/** Status line, the latest step's start time, and a redraw. */
function show($: Engine, now: number): void {
  const status = statusLine(state)
  if (status !== lastStatus) {
    lastStatus = status
    $.ui.status(status)
  }
  const last = state.steps.at(-1)
  if (last && last.id !== latest.id) latest = { id: last.id, at: now }
  $.ui.invalidate('ui.render')
}

/** Toasts only ever come from a successful poll: the first one seeds the memory with the history. */
function announce($: Engine): void {
  const toasts = milestones(state.steps, memory)
  if (!muted) for (const t of toasts) $.ui.toast(t)
}

async function poll($: Engine): Promise<void> {
  if (busy || !sessionId) return
  busy = true
  try {
    const now = await $.clock.now()
    if (!due(cadence, now)) return
    const id = await $.session.id()
    if (id && id !== sessionId) resetSession(id, now)
    let fresh: FeedStep[] | null = null
    let attention: Attention | undefined
    try {
      if (!token || state.offline) await locate($)
      const got = await fetchSteps($)
      fresh = got.steps
      attention = got.attention
    } catch {
      cadence = recordPoll(cadence, now, 'offline')
      offlinePolls += 1
      if (!state.offline) {
        state = { ...state, offline: true }
        show($, now)
      }
      if (offlinePolls >= START_AFTER_OFFLINE_POLLS && !startedServer) {
        startedServer = true
        await $.process.run(['node', `${$.plugin.root}/dist/start-server.cjs`], { stdin: '', timeoutMs: 15_000 }).catch(() => undefined)
      }
      return
    }
    // Only the steps decide online or offline: a failing explainer keeps the last state it had.
    const explainer = await get<ExplainerState>($, '/api/explainer').catch(() => state.explainer)
    const steps = fresh ?? state.steps
    const print = fresh ? stepsPrint(fresh) : stepsSeen
    const changed = state.offline || print !== stepsSeen || attention !== state.attention || explainerPrint(explainer) !== explainerPrint(state.explainer)
    stepsSeen = print
    state = { ...state, steps, explainer, offline: false }
    if (attention) state.attention = attention
    else delete state.attention
    offlinePolls = 0
    cadence = recordPoll(cadence, now, changed ? 'changed' : 'same')
    if (changed) {
      show($, now)
      announce($)
    }
  } catch {
    // Odd data in a step is not the server going away: skip this round, keep polling.
  } finally {
    busy = false
  }
}

function lineEl(Text: unknown, line: Line, mono: boolean): unknown {
  return h(Text, mono ? { mono: true } : null, ...line.map((s) => h(Text, TONE[s.tone ?? 'ink'], s.text)))
}

function stopAnimation(): void {
  animTimer?.cancel()
  animTimer = undefined
}

/** Redraw at up to 8 frames a second until the scene ends, even if the pane closes and stops asking. */
function animate($: Engine, remainingMs: number): void {
  animTicks = Math.ceil(remainingMs / ANIM_MS) + 1
  if (remainingMs <= 0) stopAnimation()
  else if (!animTimer) animTimer = $.clock.every(ANIM_MS, () => tick($))
}

function tick($: Engine): void {
  animTicks -= 1
  if (animTicks <= 0) stopAnimation()
  else $.ui.invalidate('ui.render')
}

async function drawPane($: Engine, e: RenderEvent): Promise<unknown> {
  const els = $.ui.resolve(e)
  const { Box, Text, Svg } = els
  const mono = e.surface !== 'terminal'
  const lines = renderText(textModel(state), e.viewport?.columns ?? 80, e.viewport?.rows ?? 24)
  const cards = lines.map((l) => lineEl(Text, l, mono))
  if (e.surface === 'terminal' || !Svg || state.offline) {
    stopAnimation()
    return h(Box, { flexDirection: 'column' }, ...cards)
  }
  const scene = paneScene(state.steps, readoutOf(state), (await $.clock.now()) - latest.at)
  animate($, scene?.remainingMs ?? 0)
  const alt = plain(state.steps.at(-1)?.caption) || 'Sidecar stage'
  return h(Box, { flexDirection: 'column' }, ...(scene ? [h(Svg, { source: scene.svg, alt })] : []), ...cards)
}

function drawBand($: Engine, e: RenderEvent, line: string): unknown {
  const { Box, Text, Button, Link } = $.ui.resolve(e)
  const hide = () => {
    bandHidden = true
    $.ui.invalidate('ui.render')
  }
  return h(Box, { flexDirection: 'row' },
    h(Text, { dimColor: true, wrap: 'truncate-end' }, `◢ ${line} `),
    h(Link, { href: workstationUrl(state), label: '[OPEN WORKSTATION]' }),
    h(Text, null, ' '),
    h(Button, { key: 'hide', label: 'Hide', dimColor: true, onPress: hide }),
  )
}

async function begin($: Engine, cwd: string): Promise<void> {
  await $.command.register({ name: 'sidecar', description: 'Developer Sidecar: open the pane, or web, off, on', argumentHint: '[web|off|on]' })
  state = { ...emptyState(), project: basename(cwd) }
  token = ''
  resetSession(await $.session.id(), await $.clock.now())
  pollTimer?.cancel()
  pollTimer = $.clock.every(FAST_MS, () => { void poll($) })
  // Not awaited: the first session.start holds up turn one, and the server may be slow or still starting.
  void poll($)
}

export function register(on: On): void {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      await begin($, String(e.cwd ?? ''))
    } catch { /* Sidecar never blocks the session */ }
    return result
  })

  on('command.run', { command: 'sidecar' }, async ($, e) => {
    const cmd = parseCommand(String(e.args ?? ''))
    const url = workstationUrl(state)
    if (cmd.kind === 'web') return { text: `Sidecar workstation: ${url}` }
    if (cmd.kind === 'help') return { text: HELP }
    if (cmd.kind === 'mute') {
      muted = cmd.muted
      $.ui.invalidate('ui.render')
      return { text: muted ? 'Sidecar band and toasts are off for this session.' : 'Sidecar band and toasts are on.' }
    }
    const opened = await $.ui.open({ id: PANE, title: 'Sidecar' })
    return { text: opened.isPlaced ? `Sidecar pane open. Workstation: ${url}` : `The Sidecar pane needs a wider window. Workstation: ${url}` }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: 'sidecar' }, async ($, e: RenderEvent) => drawPane($, e))
    .catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e: RenderEvent, next) => {
    const line = bandLine(state)
    if (!line || muted || bandHidden || e.props.hasSurvey) return next(e)
    return drawBand($, e, line)
  }).catch(($, e, next) => next(e))
}
