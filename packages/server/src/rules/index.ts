import { detectVendor, INSTALL, isRecord, packagesIn, segments, type Category, type SceneSpec, type Step, type Translation } from '@sidecar/shared'
import { scenes } from '@sidecar/ui-kit/catalog'

export { detectVendor, segments } from '@sidecar/shared'

interface Ctx {
  step: Step
  input: Record<string, unknown>
  command: string
  /** The command's simple commands with quoted text blanked (see segments). */
  parts: string[]
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
/** The first simple command that matches, so `git add -A && git commit` is a commit and a commit message never matches. */
const part = (c: Ctx, re: RegExp) => c.parts.find((p) => re.test(p))

// Matched against one simple command at a time (see segments), from its start, so words elsewhere never count.
// INSTALL lives in @sidecar/shared with the project map, which reads installs too.
const TEST = /^(?:(?:npm|pnpm|yarn|bun|npx|bunx|python3?|uv|poetry|cargo|go|make|deno)\b.*\b(?:test|vitest|jest|pytest|playwright|mocha)|(?:vitest|jest|pytest|playwright|mocha))\b/
const DEPLOY = /^(npx\s+|bunx\s+)?(vercel|netlify\s+deploy|fly\s+deploy|flyctl\s+deploy|railway\s+up|docker\s+push|wrangler\s+deploy)\b/
const RUN = /^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|build|preview)\b|^(npx\s+)?(next|vite)\s+(dev|build)\b|^python3?\s+\S+\.py\b|^node\s+\S+\.(m?js|ts)\b/
const BUILD = /^(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|^(npx\s+)?(next|vite)\s+build\b/
const DATA_FILE = /(schema\.prisma|\/migrations?\/|\.sql$|drizzle|schema\.(ts|js)$|models?\.py$)/i
const DATA_CMD = /^(npx\s+|bunx\s+|pnpm\s+(exec\s+)?)?(prisma\s+(migrate|db)|drizzle-kit|alembic|knex\s+migrate|supabase\s+db)\b/
const GIT = /^(git\s+(commit|push|merge|tag|checkout\s+-b|switch\s+-c|branch)|gh\s+pr\s+(create|merge))\b/
/** One command that only looks. Anything chained (a newline too), piped, redirected or substituted is not read-only. */
const LOOK = /^\s*(ls|pwd|cat|head|tail|wc|tree|file|stat|which|find|grep|rg|git\s+(status|diff|log|show))\b/
const NOT_ONLY_LOOKING = new RegExp([
  /[|;&<>`\n\r]|\$\(/.source,
  // flags that write a file, run a command or never return
  /\s-(exec|execdir|delete|ok|okdir|fprint\w*|fls)\b/.source,
  /^\s*git\b.*\s--output\b/.source,
  /^\s*tree\b.*\s-o\b/.source,
  /^\s*tail\b.*\s(-[a-zA-Z0-9]*[fF]|--follow)\b/.source,
].join('|'))

/** A shell command that names a .env file: handled like the Read tool on one, as secrets, never as a quick look. */
const ENV_FILE = /(^|[\s/'"=])\.env(\.[\w.-]+)?(?=$|[\s'";|&>)])/

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
    match: (c) => c.name.startsWith('mcp__') || basename(c.file) === '.mcp.json' || !!part(c, /^claude\s+mcp\s+add\b/),
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
    match: (c) => !!part(c, GIT),
    build: (c) => ({
      caption: part(c, /^(git\s+push|gh\s+pr\s+create)\b/) ? 'Saving a checkpoint and sending it to GitHub' : 'Saving a checkpoint of your code',
      scene: (cap) => scenes.ship(cap, c.failed),
    }),
  },
  {
    id: 'read',
    match: (c) => LOOK.test(c.command) && !NOT_ONLY_LOOKING.test(c.command) && !ENV_FILE.test(c.command),
    build: (c) => ({
      caption: /^\s*git\b/.test(c.command) ? 'Checking what has changed in your code' : 'Looking around your project',
      scene: scenes.read,
    }),
  },
  {
    id: 'install',
    match: (c) => !!part(c, INSTALL),
    build: (c) => {
      const all = packagesIn(part(c, INSTALL) ?? '')
      const pkgs = all.slice(0, 4).join(', ') + (all.length > 4 ? '…' : '')
      return { caption: pkgs ? `Adding ready-made building blocks: ${pkgs}` : 'Installing the project’s building blocks', scene: (cap) => scenes.toolbox(cap, c.failed) }
    },
  },
  {
    id: 'test',
    match: (c) => !!part(c, TEST),
    build: (c) => ({
      caption: c.step.status === 'running' ? 'Checking that the code works' : c.failed ? 'Checking the code works: some checks failed' : 'Checking the code works: all good',
      scene: (cap) => scenes.inspect(cap, c.failed),
    }),
  },
  {
    id: 'deploy',
    match: (c) => !!part(c, DEPLOY),
    build: (c) => ({ caption: 'Putting your app live on the internet', scene: (cap) => scenes.launch(cap, c.failed) }),
  },
  {
    id: 'run',
    match: (c) => !!part(c, RUN),
    build: (c) => ({
      caption: part(c, BUILD) ? 'Packaging your app so it can run fast' : 'Starting your app so you can try it',
      scene: (cap) => scenes.run(cap, c.failed),
    }),
  },
  {
    id: 'data',
    match: (c) => DATA_FILE.test(c.file) || !!part(c, DATA_CMD),
    build: () => ({ caption: 'Setting up where your app’s data is stored', scene: scenes.database }),
  },
  {
    id: 'external',
    match: (c) => c.name === 'WebFetch' || c.name === 'WebSearch' || /^\.env(\.|$)/.test(basename(c.file)) || ENV_FILE.test(c.command) || /\b(curl|wget)\s+\S*https?:/.test(c.command),
    build: (c) => {
      if (/^\.env/.test(basename(c.file)) || ENV_FILE.test(c.command)) {
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
  const input = isRecord(step.input) ? step.input : {}
  const command = step.toolName === 'Bash' ? str(input.command) : ''
  const ctx: Ctx = {
    step,
    input,
    command,
    parts: segments(command),
    file: str(input.file_path) || str(input.notebook_path) || str(input.path),
    name: step.toolName,
    failed: step.status === 'failed',
  }
  const rule = RULES.find((r) => r.match(ctx))!
  const { caption, scene } = rule.build(ctx)
  return { category: rule.id, caption, techLabel: techLabel(ctx), scene: scene(caption) }
}
