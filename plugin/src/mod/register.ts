import { renderText, type Line, type Tone } from '@sidecar/ui-kit'
import type { Engine, On, RenderEvent } from './engine'

const PANE = 'sidecar'
const TONE: Record<Tone, Record<string, unknown>> = {
  ink: {}, dim: { dimColor: true }, accent: { color: 'red' }, inverse: { inverse: true }, bold: { bold: true },
}

function lineEl(Text: unknown, line: Line, mono: boolean): unknown {
  return h(Text, mono ? { mono: true } : null, ...line.map((s) => h(Text, TONE[s.tone ?? 'ink'], s.text)))
}

function drawText($: Engine, e: RenderEvent): unknown {
  const { Box, Text } = $.ui.resolve(e)
  const lines = renderText({ project: '', live: true, readout: { step: 0, files: 0, tokens: 0, elapsed: '00:00' }, steps: [] }, e.viewport?.columns ?? 80, e.viewport?.rows ?? 24)
  return h(Box, { flexDirection: 'column' }, ...lines.map((l) => lineEl(Text, l, e.surface !== 'terminal')))
}

export function register(on: On): void {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      await $.command.register({ name: 'sidecar', description: 'Developer Sidecar: open the pane', argumentHint: '[web|off|on]' })
    } catch { /* never block the session */ }
    return result
  })

  on('command.run', { command: 'sidecar' }, async ($) => {
    const opened = await $.ui.open({ id: PANE, title: 'Sidecar' })
    return { text: opened.isPlaced ? 'Sidecar pane open.' : 'The Sidecar pane needs a wider window.' }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e: RenderEvent) => drawText($, e))
    .catch(($, e, next) => next(e))
}
