// Reading shell commands: shared by the server's rules and the project map.

/** A .env file a shell command names (the name in group 1), like `cat .env.local`; never `.envrc` or `environment.ts`. */
export const ENV_FILE = /(?:^|[\s/'"=])(\.env(?:\.[\w.-]+)?)(?=$|[\s'";|&>)])/

/** Every .env file a shell command names, once each: `cp .env.example .env.local` names both. */
export function envFilesIn(command: string): string[] {
  return [...new Set([...command.matchAll(new RegExp(ENV_FILE.source, 'g'))].map((m) => m[1]!))]
}

/** Install commands, matched against one simple command from its start (see segments). */
export const INSTALL = /^(npm|pnpm|yarn|bun)\s+(i|install|add)\b|^(pip3?|uv\s+pip|poetry)\s+(install|add)\b|^python3?\s+-m\s+pip\s+install\b|^uv\s+add\b|^cargo\s+add\b|^go\s+get\b/

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
const VALUE_FLAGS = new Set(['-r', '--requirement', '-c', '--constraint', '-e', '--editable', '--prefix', '--registry', '-i', '--index-url', '--extra-index-url', '-w', '--workspace', '--filter'])
/** A local folder or file, not a package: `.`, `./...`, `../local-pkg`, `/tmp/x`, `~/x`, `file:../x`. */
const LOCAL_PATH = /^(\.{1,2}(\/|$)|[/~]|(file|link):)/

/** The packages an install command names, with flags, flag values, local paths, env assignments (FOO=1) and a trailing comment left out. */
export function packagesIn(command: string): string[] {
  const m = command.match(/\b(?:i|install|add|get)\b(.*)$/)
  const pkgs: string[] = []
  const tokens = (m?.[1] ?? '').split(/\s+/)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.startsWith('#')) break
    if (VALUE_FLAGS.has(t)) i++
    else if (t && !t.startsWith('-') && !/^\w+=(?!=)/.test(t) && !LOCAL_PATH.test(t)) pkgs.push(t)
  }
  return pkgs
}
