import { expect, test } from 'claude-code/testing'

const SURFACES = ['terminal', 'desktop'] as const

test('/sidecar opens the pane and the pane draws the empty readout', async ($, on) => {
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  await $.session.start({ source: 'startup', cwd: '/work/shop', surface: 'terminal' } as never)

  const ran = await $.command.run({ command: 'sidecar', args: '' } as never)
  expect(ran).toMatchObject({ text: 'Sidecar pane open.' })

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'developer-sidecar', surface, component: 'Pane', props: {} as never, requestId: 'sidecar', viewport: { columns: 80, rows: 24 } })
    expect(await ui.find({ text: /STEP/ })).toBeDefined()
  }
})
