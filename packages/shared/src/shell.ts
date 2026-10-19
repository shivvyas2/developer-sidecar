// Reading shell commands: shared by the server's rules and the project map.

/** Install commands, matched against one simple command from its start (see segments). */
export const INSTALL = /^(npm|pnpm|yarn|bun)\s+(i|install|add)\b|^(pip3?|uv\s+pip|poetry)\s+(install|add)\b|^python3?\s+-m\s+pip\s+install\b|^uv\s+add\b|^cargo\s+add\b|^go\s+get\b/

/**
 * The simple commands in a shell line, split on `&&`, `||`, `;`, `|`, `&` and newlines. Quoted text is blanked, so a
 * commit message or an echo can't look like a command, and leading env assignments, `sudo` and subshell brackets go.
 * With `raw`, the same parts keep their quoted text and lose the quotes (`pip install "django>=4"` gives `django>=4`).
 */
export function segments(cmd: string, o: { raw?: boolean } = {}): string[] {
  // blank and raw stay the same length, char for char; raw marks each quote with \0 so it can be dropped at the end
  const out: { blank: string; raw: string }[] = []
  let cur = ''
  let raw = ''
  let quote = ''
  const cut = () => { out.push({ blank: cur, raw }); cur = ''; raw = '' }
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (quote) {
      if (ch === quote) { quote = ''; cur += ch; raw += '\0'; continue }
      if (ch === '\\' && quote === '"') i++
      cur += ' '
      raw += cmd[i] ?? ' '
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; raw += '\0'; continue }
    // an escaped character, or a line continuation, stays inside the command
    if (ch === '\\') { const two = ch + (cmd[i + 1] ?? ''); cur += two; raw += two; i++; continue }
    const two = cmd.slice(i, i + 2)
    if (two === '&&' || two === '||') { cut(); i++; continue }
    // a lone & runs in the background, but 2>&1 and &> are redirections
    const background = ch === '&' && !/[<>]/.test(cmd[i - 1] ?? '') && cmd[i + 1] !== '>'
    if (ch === ';' || ch === '|' || ch === '\n' || ch === '\r' || background) { cut(); continue }
    cur += ch
    raw += ch
  }
  cut()
  return out.flatMap((s) => {
    const end = s.blank.trimEnd().length
    const start = s.blank.slice(0, end).match(/^\s*(?:[({]\s*)?(?:\w+=(?:"[^"]*"|'[^']*'|\S*)\s+)*(?:(?:sudo|time|exec)\s+)?\s*/)![0].length
    if (start >= end) return []
    return [o.raw ? s.raw.slice(start, end).replaceAll('\0', '').trim() : s.blank.slice(start, end)]
  })
}

/** The packages an install command names, with flags and env assignments (FOO=1) left out. */
export function packagesIn(command: string): string[] {
  const m = command.match(/\b(?:i|install|add|get)\b(.*)$/)
  return (m?.[1] ?? '').split(/\s+/).filter((t) => t && !t.startsWith('-') && !/^[A-Z_][A-Z0-9_]*=/.test(t))
}
