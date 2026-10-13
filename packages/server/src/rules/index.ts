import type { Category, SceneSpec, Step, Translation } from '@sidecar/shared'
import { scenes } from './scenes'
import { detectVendor } from './vendors'

export { detectVendor } from './vendors'

interface Ctx {
  step: Step
  input: Record<string, unknown>
  command: string
  file: string
  name: string
  failed: boolean
}

interface Rule {
  id: Category
  match(c: Ctx): boolean
  build(c: Ctx): { caption: string; scene: (caption: string) => SceneSpec }
}

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p
const short = (s: string, n = 100) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

const INSTALL = /\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b|\b(pip3?|uv\s+pip|poetry)\s+(install|add)\b|\buv\s+add\b|\bcargo\s+add\b|\bgo\s+get\b/
const TEST = /\b(test|vitest|jest|pytest|playwright|mocha|cargo\s+test|go\s+test)\b/
const DEPLOY = /\b(vercel|netlify\s+deploy|fly\s+deploy|flyctl\s+deploy|railway\s+up|docker\s+push|wrangler\s+deploy)\b/
const RUN = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|build|preview)\b|\b(next|vite)\s+(dev|build)\b|\bpython3?\s+\S+\.py\b|\bnode\s+\S+\.(m?js|ts)\b/
const DATA_FILE = /(schema\.prisma|\/migrations?\/|\.sql$|drizzle|schema\.(ts|js)$|models?\.py$)/i
const DATA_CMD = /\b(prisma\s+(migrate|db)|drizzle-kit|alembic|knex\s+migrate|supabase\s+db)\b/
const GIT = /^\s*(git\s+(commit|push|merge|tag|checkout\s+-b|switch\s+-c|branch)|gh\s+pr\s+(create|merge))\b/

function packagesFrom(command: string): string {
  const m = command.match(/\b(?:i|install|add|get)\b(.*)$/)
  const pkgs = (m?.[1] ?? '').split(/\s+/).filter((t) => t && !t.startsWith('-') && !t.includes('='))
  return pkgs.length ? pkgs.slice(0, 4).join(', ') + (pkgs.length > 4 ? '…' : '') : ''
}

const RULES: Rule[] = [
  {
    id: 'prompt',
    match: (c) => c.name === 'UserPrompt',
    build: (c) => ({ caption: `You asked: “${short(str(c.input.prompt), 90)}”`, scene: scenes.prompt }),
  },
  {
    id: 'subagent',
    match: (c) => c.name === 'Task' || c.name === 'Agent',
    build: (c) => ({
      caption: `Sending a helper to work in parallel: ${short(str(c.input.description) || 'a side task', 60)}`,
      scene: scenes.helper,
    }),
  },
  {
    id: 'mcp',
    match: (c) => c.name.startsWith('mcp__') || basename(c.file) === '.mcp.json' || /\bclaude\s+mcp\s+add\b/.test(c.command),
    build: (c) => {
      if (c.name.startsWith('mcp__')) {
        const [, server = 'a', tool = 'tool'] = c.name.split('__')
        return { caption: `Using the ${server} gadget (MCP tool “${tool}”)`, scene: (cap) => scenes.gadget(cap, server) }
      }
      return { caption: 'Giving Claude a new tool via MCP', scene: (cap) => scenes.gadget(cap) }
    },
  },
  {
    id: 'git',
    match: (c) => GIT.test(c.command),
    build: (c) => ({
      caption: /push|pr\s+create/.test(c.command) ? 'Saving a checkpoint and sending it to GitHub' : 'Saving a checkpoint of your code',
      scene: (cap) => scenes.ship(cap, c.failed),
    }),
  },
  {
    id: 'install',
    match: (c) => INSTALL.test(c.command),
    build: (c) => {
      const pkgs = packagesFrom(c.command)
      return { caption: pkgs ? `Adding ready-made building blocks: ${pkgs}` : 'Installing the project’s building blocks', scene: (cap) => scenes.toolbox(cap, c.failed) }
    },
  },
  {
    id: 'test',
    match: (c) => TEST.test(c.command),
    build: (c) => ({
      caption: c.step.status === 'running' ? 'Checking that the code works' : c.failed ? 'Checking the code works — some checks failed' : 'Checking the code works — all good',
      scene: (cap) => scenes.inspect(cap, c.failed),
    }),
  },
  {
    id: 'deploy',
    match: (c) => DEPLOY.test(c.command),
    build: (c) => ({ caption: 'Putting your app live on the internet', scene: (cap) => scenes.launch(cap, c.failed) }),
  },
  {
    id: 'run',
    match: (c) => RUN.test(c.command),
    build: (c) => ({
      caption: /build/.test(c.command) ? 'Packaging your app so it can run fast' : 'Starting your app so you can try it',
      scene: (cap) => scenes.run(cap, c.failed),
    }),
  },
  {
    id: 'data',
    match: (c) => DATA_FILE.test(c.file) || DATA_CMD.test(c.command),
    build: () => ({ caption: 'Setting up where your app’s data is stored', scene: scenes.database }),
  },
  {
    id: 'external',
    match: (c) => c.name === 'WebFetch' || c.name === 'WebSearch' || /^\.env(\.|$)/.test(basename(c.file)) || /\b(curl|wget)\s+\S*https?:/.test(c.command),
    build: (c) => {
      if (/^\.env/.test(basename(c.file))) {
        return { caption: 'Storing secret settings (like API keys) safely outside the code', scene: (cap) => scenes.connect(cap, undefined, c.failed) }
      }
      if (c.name === 'WebSearch') {
        return { caption: `Looking something up on the web: “${short(str(c.input.query), 60)}”`, scene: (cap) => scenes.connect(cap, 'Web', c.failed) }
      }
      const target = str(c.input.url) || c.command
      const vendor = detectVendor(target)
      return {
        caption: vendor ? `Reaching out to ${vendor}` : 'Reaching out to an outside service',
        scene: (cap) => scenes.connect(cap, vendor, c.failed),
      }
    },
  },
  {
    id: 'read',
    match: (c) => ['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'].includes(c.name),
    build: (c) => ({
      caption: c.name === 'Read' ? `Reading ${basename(c.file) || 'a file'} to understand it` : 'Searching through your code',
      scene: scenes.read,
    }),
  },
  {
    id: 'create',
    match: (c) => c.name === 'Write',
    build: (c) => ({ caption: `Writing ${basename(c.file) || 'a file'}`, scene: scenes.brick }),
  },
  {
    id: 'edit',
    match: (c) => ['Edit', 'MultiEdit', 'NotebookEdit'].includes(c.name),
    build: (c) => ({ caption: `Changing ${basename(c.file) || 'a file'}`, scene: scenes.bolt }),
  },
  {
    id: 'fallback',
    match: () => true,
    build: (c) => ({ caption: c.name === 'Bash' ? 'Running a command' : 'Working…', scene: scenes.thinking }),
  },
]

export const RULE_IDS: Category[] = RULES.map((r) => r.id)

function techLabel(c: Ctx): string {
  if (c.name === 'UserPrompt') return 'UserPromptSubmit'
  if (c.command) return `Bash: ${short(c.command, 200)}`
  if (c.file) return `${c.name} ${c.file}`
  const url = str(c.input.url) || str(c.input.query) || str(c.input.pattern)
  return url ? `${c.name} ${short(url, 200)}` : c.name
}

export function translate(step: Step): Translation {
  const input = step.input && typeof step.input === 'object' && !Array.isArray(step.input) ? (step.input as Record<string, unknown>) : {}
  const ctx: Ctx = {
    step,
    input,
    command: step.toolName === 'Bash' ? str(input.command) : '',
    file: str(input.file_path) || str(input.notebook_path) || str(input.path),
    name: step.toolName,
    failed: step.status === 'failed',
  }
  const rule = RULES.find((r) => r.match(ctx))!
  const { caption, scene } = rule.build(ctx)
  return { category: rule.id, caption, techLabel: techLabel(ctx), scene: scene(caption) }
}
