import { isRecord, type Category, type SceneSpec, type Step, type Translation } from '@sidecar/shared'
import { scenes } from '@sidecar/ui-kit/catalog'
import { detectVendor } from './vendors'

export { detectVendor } from './vendors'

interface Ctx {
  step: Step
  input: Record<string, unknown>
  command: string
  /** The command's simple commands with quoted text blanked (see segments). */
  parts: string[]
  /** The same parts with their quoted text kept, for reading names out of them (see segments). */
  raw: string[]
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
/** That part with its quoted text kept, so `npm i "@scope/pkg"` names the package, not the quotes. */
const rawPart = (c: Ctx, re: RegExp) => c.raw[c.parts.findIndex((p) => re.test(p))]

// Matched against one simple command at a time (see segments), from its start, so words elsewhere never count.
const INSTALL = /^(npm|pnpm|yarn|bun)\s+(i|install|add)\b|^(pip3?|uv\s+pip|poetry)\s+(install|add)\b|^python3?\s+-m\s+pip\s+install\b|^uv\s+add\b|^cargo\s+add\b|^go\s+get\b/
/** What can run a package's own command: `npx vitest`, `pnpm exec vercel`, `yarn prisma`, `bunx vite`, or nothing. */
const RUNNER = /^((npx|bunx|bun\s+x|npm\s+exec|pnpm(\s+(exec|dlx))?|yarn(\s+dlx)?)\s+(-\S+\s+)*)?/.source
const viaRunner = (re: RegExp) => new RegExp(RUNNER + re.source)
const oneOf = (...res: RegExp[]) => new RegExp(res.map((r) => r.source).join('|'))
/** A test runner in the command's runner position, so `npx playwright install` or `tsc -p tsconfig.test.json` is not a test run. */
const TEST = oneOf(
  // flags may take a value (`pnpm --filter web test`), and yarn picks a workspace by name
  /^(npm|pnpm|yarn|bun)\s+(-\S+\s+(\S+\s+)?|workspace\s+\S+\s+)*(run\s+)?test\b/,
  viaRunner(/(vitest|jest|mocha|playwright\s+test|cypress\s+run)\b/),
  /^((python3?\s+-m|uv\s+run|poetry\s+run)\s+)?pytest\b/,
  /^(\.\/)?(bin\/)?(cargo|go|deno|make|dotnet|gradlew|gradle|mvnw|mvn|mix|swift|flutter|rails|php\s+artisan)\s+(-\S+\s+)*test\b/,
)
// vercel deploys with `deploy`, a flag, a folder or nothing after it; `vercel env pull` or `vercel link` does not
const DEPLOY = viaRunner(/(vercel(?=\s*$|\s+(deploy\b|-|\.|\/|~|\d*>))|netlify\s+deploy|fly\s+deploy|flyctl\s+deploy|railway\s+up|docker\s+push|wrangler\s+deploy)\b/)
const RUN = oneOf(/^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|build|preview)\b/, viaRunner(/(next|vite)\s+(dev|build)\b/), /^python3?\s+\S+\.py\b|^node\s+\S+\.(m?js|ts)\b/)
const BUILD = oneOf(/^(npm|pnpm|yarn|bun)\s+(run\s+)?build\b/, viaRunner(/(next|vite)\s+build\b/))
const DATA_FILE = /(schema\.prisma|\/migrations?\/|\.sql$|drizzle|schema\.(ts|js)$|models?\.py$)/i
const DATA_CMD = viaRunner(/(prisma\s+(migrate|db)|drizzle-kit|alembic|knex\s+migrate|supabase\s+db)\b/)
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

/** What runs before the command itself: env assignments, and `sudo`, `env`, `time` or `exec` with their flags. */
const PREFIX = /^\s*(?:(?:\w+=(?:"[^"]*"|'[^']*'|\$\([^)]*\)|`[^`]*`|[^\s"'`])*|(?:sudo|env)(?:\s+-[uCgS]\s+\S+|\s+-\S+)*|time|exec)\s+)*/

/** Where the heredoc bodies starting at `from` end: at the newline after the last delimiter line, or the end of the command. */
function heredocEnd(cmd: string, from: number, words: string[]): number {
  let next = from
  let end = from
  for (const word of words) {
    for (;;) {
      const nl = cmd.indexOf('\n', next)
      end = nl < 0 ? cmd.length : nl
      const line = cmd.slice(next, end)
      next = end + 1
      if (line.trim() === word || nl < 0) break
    }
  }
  return end
}

/**
 * The simple commands in a shell line, split on `&&`, `||`, `;`, `|`, `&` and newlines. Quoted text, `$( )` and
 * backtick substitutions and heredoc bodies are blanked, so a commit message, an echo or a file's contents can't look
 * like a command, and leading env assignments, `sudo` and subshell brackets go.
 * With `raw`, the same parts keep their quoted text and lose the quotes (`pip install "django>=4"` gives `django>=4`).
 */
export function segments(cmd: string, o: { raw?: boolean } = {}): string[] {
  // blank and raw stay the same length, char for char; raw marks each top-level quote with \0 so it can be dropped at the end
  const out: { blank: string; raw: string }[] = []
  let cur = ''
  let raw = ''
  // what we are inside: a quote, a backtick or a $( ) substitution, with the brackets open inside it
  const stack: { kind: string; open: number }[] = []
  // heredoc delimiters whose bodies start at the next newline
  let heredocs: string[] = []
  // the closing brackets of the subshells and { } groups open at the top level
  const groups: string[] = []
  const cut = () => { out.push({ blank: cur, raw }); cur = ''; raw = '' }
  // top-level text is kept as is; anything inside a quote or substitution is blanked
  const put = (text: string, mark = text) => { cur += stack.length ? ' '.repeat(text.length) : text; raw += mark }
  const quoteMark = (ch: string) => (stack.length ? ch : '\0')
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    const two = cmd.slice(i, i + 2)
    const inside = stack.at(-1)
    if (inside?.kind === "'") {
      if (ch === "'") { stack.pop(); put(ch, quoteMark(ch)) } else put(ch)
      continue
    }
    if (inside?.kind === '`') {
      if (ch === '\\') { put(two); i++ } else if (ch === '`') { stack.pop(); put(ch) } else put(ch)
      continue
    }
    if (inside?.kind === '"') {
      if (ch === '"') { stack.pop(); put(ch, quoteMark(ch)) }
      // an escaped character keeps only itself in raw: say \"hi\" gives say "hi"
      else if (ch === '\\') { i++; put(' ', cmd[i] ?? ' ') }
      else if (two === '$(') { put(two); stack.push({ kind: '$(', open: 0 }); i++ }
      else if (ch === '`') { put(ch); stack.push({ kind: '`', open: 0 }) }
      else put(ch)
      continue
    }
    // top level, or inside a $( ) substitution
    if (ch === '\n' && heredocs.length) {
      const end = heredocEnd(cmd, i + 1, heredocs)
      heredocs = []
      if (stack.length) put(ch); else cut()
      cur += ' '.repeat(end - i - 1)
      raw += cmd.slice(i + 1, end)
      i = end - 1
      continue
    }
    if (cmd.startsWith('<<<', i)) { put('<<<'); i += 2; continue }
    const heredoc = two === '<<' && cmd.slice(i).match(/^<<-?\s*(['"]?)([^\s'"<>;&|()]+)\1/)
    if (heredoc) { put(heredoc[0]); heredocs.push(heredoc[2]!); i += heredoc[0].length - 1; continue }
    if (ch === '"' || ch === "'") { put(ch, quoteMark(ch)); stack.push({ kind: ch, open: 0 }); continue }
    if (ch === '`') { put(ch); stack.push({ kind: ch, open: 0 }); continue }
    if (two === '$(') { put(two); stack.push({ kind: '$(', open: 0 }); i++; continue }
    // an escaped character, or a line continuation, stays inside the command
    if (ch === '\\') { put(two); i++; continue }
    if (inside) {
      if (ch === '(') inside.open++
      else if (ch === ')') { if (inside.open) inside.open--; else stack.pop() }
      put(ch)
      continue
    }
    // a comment runs to the end of the line; a # inside a word (a#b, $#) is not one
    if (ch === '#' && (i === 0 || /[\s;&|(]/.test(cmd[i - 1]!))) {
      const nl = cmd.indexOf('\n', i)
      const end = nl < 0 ? cmd.length : nl
      cur += ' '.repeat(end - i)
      raw += ' '.repeat(end - i)
      i = end - 1
      continue
    }
    // subshell and group brackets go, both ends, so `(cd app && npm i x)` names x, not x)
    const opensGroup = ch === '(' || (ch === '{' && !cur.trim() && /\s/.test(cmd[i + 1] ?? ''))
    const closesGroup = groups.at(-1) === ch && (ch === ')' || !cur.trim())
    if (opensGroup || closesGroup) {
      if (opensGroup) groups.push(ch === '(' ? ')' : '}'); else groups.pop()
      cur += ' '
      raw += ' '
      continue
    }
    if (two === '&&' || two === '||') { cut(); i++; continue }
    // a lone & runs in the background, but 2>&1 and &> are redirections
    const background = ch === '&' && !/[<>]/.test(cmd[i - 1] ?? '') && cmd[i + 1] !== '>'
    if (ch === ';' || ch === '|' || ch === '\n' || ch === '\r' || background) { cut(); continue }
    put(ch)
  }
  cut()
  return out.flatMap((s) => {
    const end = s.blank.trimEnd().length
    const start = s.blank.slice(0, end).match(PREFIX)![0].length
    if (start >= end) return []
    return [o.raw ? s.raw.slice(start, end).replaceAll('\0', '').trim() : s.blank.slice(start, end)]
  })
}

/** Flags whose value is a file, a folder, a url or a workspace, never a package: `pip install -r requirements.txt`. */
const VALUE_FLAGS = new Set(['-r', '--requirement', '-c', '--constraint', '--prefix', '--registry', '-i', '--index-url', '--extra-index-url', '-w', '--workspace', '--filter'])

function packagesFrom(command: string): string {
  const m = command.match(/\b(?:i|install|add|get)\b(.*)$/)
  const pkgs: string[] = []
  const tokens = (m?.[1] ?? '').split(/\s+/)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.startsWith('#')) break
    if (VALUE_FLAGS.has(t)) i++
    else if (t && !t.startsWith('-') && !/^\w+=(?!=)/.test(t)) pkgs.push(t)
  }
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
      const pkgs = packagesFrom(rawPart(c, INSTALL) ?? '')
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
    raw: segments(command, { raw: true }),
    file: str(input.file_path) || str(input.notebook_path) || str(input.path),
    name: step.toolName,
    failed: step.status === 'failed',
  }
  const rule = RULES.find((r) => r.match(ctx))!
  const { caption, scene } = rule.build(ctx)
  return { category: rule.id, caption, techLabel: techLabel(ctx), scene: scene(caption) }
}
