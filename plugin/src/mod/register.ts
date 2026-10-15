/**
 * Developer Sidecar inside Claude Code (spec §7): pane, status line, band, toasts and /sidecar.
 * Capture stays with the classic hooks; this module only reads the local server.
 * Every helper that takes `$` is a top-level function: the engine's validator requires it.
 */
import type { ExplainerState, FeedStep } from '@sidecar/shared'
import { renderText, type Line, type Tone } from '@sidecar/ui-kit'
import { due, FAST_MS, newCadence, recordPoll, type Cadence } from './cadence'
import { HELP, parseCommand } from './commands'
import type { Engine, On, RenderEvent } from './engine'
import { bandLine, basename, emptyState, fingerprint, plain, readoutOf, statusLine, textModel, workstationUrl, type ModState } from './model'
import { paneScene } from './scene'
import { freshMemory, milestones, type ToastMemory } from './toasts'

const PANE = 'sidecar'
const ANIM_MS = 125 // up to 8 frames a second while a scene plays
const START_AFTER_OFFLINE_POLLS = 3
const TONE: Record<Tone, Record<string, unknown>> = {
  ink: {}, dim: { dimColor: true }, accent: { color: 'red' }, inverse: { inverse: true }, bold: { bold: true },
}

let state: ModState = emptyState()
let token = ''
let sessionId = ''
let cadence: Cadence = newCadence(0)
let memory: ToastMemory = freshMemory()
let lastStatus: string | undefined
let latest = { id: '', at: 0 }
let muted = false
let bandHidden = false
let busy = false
let offlinePolls = 0
let startedServer = false
let stopAnim: (() => void) | undefined

async function locate($: Engine): Promise<void> {
  const ran = await $.process.run(['node', `${$.plugin.root}/dist/locate.cjs`], { timeoutMs: 5_000 })
  const found = JSON.parse(ran.stdout || '{}') as { port?: number; token?: string | null }
  if (typeof found.port === 'number') state = { ...state, port: found.port }
  token = found.token ?? ''
}

async function get<T>($: Engine, path: string): Promise<T> {
  const res = await $.http.fetch(`http://127.0.0.1:${state.port}${path}`, { headers: { 'x-sidecar-token': token } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.text) as T
}

function publish($: Engine, now: number): void {
  const status = statusLine(state)
  if (status !== lastStatus) {
    lastStatus = status
    $.ui.status(status)
  }
  const last = state.steps.at(-1)
  if (last && last.id !== latest.id) latest = { id: last.id, at: now }
  const toasts = milestones(state.steps, memory)
  if (!muted) for (const t of toasts) $.ui.toast(t)
  $.ui.invalidate('ui.render')
}

async function poll($: Engine): Promise<void> {
  if (busy || !sessionId) return
  const now = await $.clock.now()
  if (!due(cadence, now)) return
  busy = true
  try {
    if (!token || state.offline) await locate($)
    const [steps, explainer] = await Promise.all([
      get<FeedStep[]>($, `/api/sessions/${encodeURIComponent(sessionId)}/steps`),
      get<ExplainerState>($, '/api/explainer'),
    ])
    const changed = state.offline || fingerprint(steps, explainer) !== fingerprint(state.steps, state.explainer)
    state = { ...state, steps, explainer, offline: false }
    offlinePolls = 0
    cadence = recordPoll(cadence, now, changed ? 'changed' : 'same')
    if (changed) publish($, now)
  } catch {
    cadence = recordPoll(cadence, now, 'offline')
    offlinePolls += 1
    if (!state.offline) {
      state = { ...state, offline: true }
      publish($, now)
    }
    if (offlinePolls >= START_AFTER_OFFLINE_POLLS && !startedServer) {
      startedServer = true
      await $.process.run(['node', `${$.plugin.root}/dist/start-server.cjs`], { stdin: '', timeoutMs: 15_000 }).catch(() => undefined)
    }
  } finally {
    busy = false
  }
}

function lineEl(Text: unknown, line: Line, mono: boolean): unknown {
  return h(Text, mono ? { mono: true } : null, ...line.map((s) => h(Text, TONE[s.tone ?? 'ink'], s.text)))
}

function animate($: Engine, playing: boolean): void {
  if (playing && !stopAnim) stopAnim = $.clock.every(ANIM_MS, () => $.ui.invalidate('ui.render'))
  else if (!playing && stopAnim) {
    stopAnim()
    stopAnim = undefined
  }
}

async function drawPane($: Engine, e: RenderEvent): Promise<unknown> {
  const els = $.ui.resolve(e)
  const { Box, Text, Svg } = els
  const mono = e.surface !== 'terminal'
  const lines = renderText(textModel(state), e.viewport?.columns ?? 80, e.viewport?.rows ?? 24)
  const cards = lines.map((l) => lineEl(Text, l, mono))
  if (e.surface === 'terminal' || !Svg || state.offline) return h(Box, { flexDirection: 'column' }, ...cards)
  const scene = paneScene(state.steps, readoutOf(state), (await $.clock.now()) - latest.at)
  animate($, scene?.playing ?? false)
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
  sessionId = await $.session.id()
  state = { ...emptyState(), project: basename(cwd) }
  cadence = newCadence(await $.clock.now())
  memory = freshMemory()
  token = ''
  $.clock.every(FAST_MS, () => { void poll($) })
  await poll($)
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
