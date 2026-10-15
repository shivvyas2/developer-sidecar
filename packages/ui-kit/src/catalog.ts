import type { SceneSpec } from '@sidecar/shared'

type Beat = SceneSpec['beats'][number]
const done = (failed: boolean, at: string): Beat => ({ fx: failed ? 'error' : 'success', at })

export const scenes = {
  prompt: (caption: string): SceneSpec => ({
    scene: 'user-asks', cast: ['you', 'claude'],
    beats: [{ actor: 'you', do: 'speak', to: 'claude' }, { fx: 'speech', at: 'you' }], caption,
  }),
  helper: (caption: string): SceneSpec => ({
    scene: 'helper-joins', cast: ['claude', 'helper'],
    beats: [{ actor: 'helper', do: 'walkTo', to: 'claude' }, { actor: 'claude', do: 'hand', to: 'helper' }], caption,
  }),
  gadget: (caption: string, label?: string): SceneSpec => ({
    scene: 'mcp-gadget', cast: ['claude', { place: 'toolbox', ...(label ? { label } : {}) }],
    beats: [{ actor: 'claude', do: 'hand', to: 'toolbox' }, { fx: 'sparkle', at: 'claude' }], caption,
  }),
  ship: (caption: string, failed: boolean): SceneSpec => ({
    scene: 'ship-box', cast: ['claude', { place: 'app' }],
    beats: [{ actor: 'claude', do: 'ship', to: 'app' }, done(failed, 'app')], caption,
  }),
  toolbox: (caption: string, failed: boolean): SceneSpec => ({
    scene: 'unpack-toolbox', cast: ['claude', { place: 'toolbox' }],
    beats: [{ actor: 'claude', do: 'walkTo', to: 'toolbox' }, { actor: 'claude', do: 'unpack', to: 'toolbox' }, done(failed, 'toolbox')], caption,
  }),
  inspect: (caption: string, failed: boolean): SceneSpec => ({
    scene: 'inspect-app', cast: ['claude', { place: 'app' }],
    beats: [{ actor: 'claude', do: 'inspect', to: 'app' }, done(failed, 'app')], caption,
  }),
  launch: (caption: string, failed: boolean): SceneSpec => ({
    scene: 'launch-cloud', cast: ['claude', { place: 'app' }, { place: 'cloud' }],
    beats: [{ actor: 'claude', do: 'launch', to: 'cloud' }, done(failed, 'cloud')], caption,
  }),
  run: (caption: string, failed: boolean): SceneSpec => ({
    scene: 'start-engine', cast: ['claude', { place: 'app' }],
    beats: [{ actor: 'claude', do: 'walkTo', to: 'app' }, done(failed, 'app')], caption,
  }),
  database: (caption: string): SceneSpec => ({
    scene: 'build-cabinets', cast: ['claude', { place: 'database' }],
    beats: [{ actor: 'claude', do: 'walkTo', to: 'database' }, { actor: 'claude', do: 'hammer', to: 'database' }], caption,
  }),
  connect: (caption: string, label: string | undefined, failed: boolean): SceneSpec => ({
    scene: 'connect-service', cast: ['claude', { place: 'service', ...(label ? { label } : {}) }],
    beats: [
      { actor: 'claude', do: 'walkTo', to: 'service' },
      { actor: 'claude', do: 'plugCable', to: 'service' },
      failed ? { fx: 'error', at: 'service' } : { fx: 'sparkle', at: 'service' },
    ], caption,
  }),
  read: (caption: string): SceneSpec => ({
    scene: 'read-bookshelf', cast: ['claude', { place: 'bookshelf' }],
    beats: [{ actor: 'claude', do: 'walkTo', to: 'bookshelf' }, { actor: 'claude', do: 'read', to: 'bookshelf' }], caption,
  }),
  brick: (caption: string): SceneSpec => ({
    scene: 'place-brick', cast: ['claude', { place: 'app' }],
    beats: [{ actor: 'claude', do: 'walkTo', to: 'app' }, { actor: 'claude', do: 'hammer', to: 'app' }, { fx: 'sparkle', at: 'app' }], caption,
  }),
  bolt: (caption: string): SceneSpec => ({
    scene: 'tighten-bolt', cast: ['claude', { place: 'app' }],
    beats: [{ actor: 'claude', do: 'walkTo', to: 'app' }, { actor: 'claude', do: 'hammer', to: 'app' }], caption,
  }),
  thinking: (caption: string): SceneSpec => ({
    scene: 'thinking', cast: ['claude'],
    beats: [{ actor: 'claude', do: 'think' }, { fx: 'thinking', at: 'claude' }], caption,
  }),
}

/** One example of every scene, used by the /kit gallery and snapshot tests. */
export const SAMPLE_SCENES: ReadonlyArray<{ name: string; spec: SceneSpec }> = [
  { name: 'prompt', spec: scenes.prompt('You asked: “add Stripe checkout”') },
  { name: 'helper', spec: scenes.helper('A helper is exploring the codebase') },
  { name: 'gadget', spec: scenes.gadget('Using the github gadget (MCP tool “create_issue”)', 'github') },
  { name: 'ship', spec: scenes.ship('Saving a checkpoint: “add checkout”', false) },
  { name: 'install', spec: scenes.toolbox('Adding ready-made building blocks: stripe', false) },
  { name: 'install-failed', spec: scenes.toolbox('Adding ready-made building blocks: stripe', true) },
  { name: 'test', spec: scenes.inspect('Checking everything still works', false) },
  { name: 'test-failed', spec: scenes.inspect('Checking everything still works', true) },
  { name: 'deploy', spec: scenes.launch('Sending your app to the cloud', false) },
  { name: 'run', spec: scenes.run('Starting your app', false) },
  { name: 'data', spec: scenes.database('Shaping where your data lives: schema.prisma') },
  { name: 'external', spec: scenes.connect('Connecting to Stripe', 'Stripe', false) },
  { name: 'external-failed', spec: scenes.connect('Connecting to Stripe', 'Stripe', true) },
  { name: 'read', spec: scenes.read('Reading app.ts') },
  { name: 'create', spec: scenes.brick('Creating users.ts') },
  { name: 'edit', spec: scenes.bolt('Changing auth.ts') },
  { name: 'thinking', spec: scenes.thinking('Working…') },
]
