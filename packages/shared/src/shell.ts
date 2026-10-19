// Reading shell commands: shared by the server's rules and the project map.

/** Install commands, matched against one simple command from its start (see segments). */
export const INSTALL = /^(npm|pnpm|yarn|bun)\s+(i|install|add)\b|^(pip3?|uv\s+pip|poetry)\s+(install|add)\b|^python3?\s+-m\s+pip\s+install\b|^uv\s+add\b|^cargo\s+add\b|^go\s+get\b/

/**
 * The simple commands in a shell line, split on `&&`, `||`, `;`, `|`, `&` and newlines. Quoted text is blanked, so a
 * commit message or an echo can't look like a command, and leading env assignments, `sudo` and subshell brackets go.
 */
export function segments(cmd: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote = ''
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (quote) {
      if (ch === quote) { quote = ''; cur += ch } else { if (ch === '\\' && quote === '"') i++; cur += ' ' }
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue }
    // an escaped character, or a line continuation, stays inside the command
    if (ch === '\\') { cur += ch + (cmd[i + 1] ?? ''); i++; continue }
    const two = cmd.slice(i, i + 2)
    if (two === '&&' || two === '||') { out.push(cur); cur = ''; i++; continue }
    // a lone & runs in the background, but 2>&1 and &> are redirections
    const background = ch === '&' && !/[<>]/.test(cmd[i - 1] ?? '') && cmd[i + 1] !== '>'
    if (ch === ';' || ch === '|' || ch === '\n' || ch === '\r' || background) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
    .map((s) => s.trim().replace(/^[({]\s*/, '').replace(/^(\w+=\S*\s+)+/, '').replace(/^(sudo|time|exec)\s+/, '').trim())
    .filter(Boolean)
}

/** The packages an install command names, with flags and env assignments (FOO=1) left out. */
export function packagesIn(command: string): string[] {
  const m = command.match(/\b(?:i|install|add|get)\b(.*)$/)
  return (m?.[1] ?? '').split(/\s+/).filter((t) => t && !t.startsWith('-') && !/^[A-Z_][A-Z0-9_]*=/.test(t))
}
