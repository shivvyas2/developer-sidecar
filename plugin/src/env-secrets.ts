import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ENV_FILE = /^\.env(\..+)?$/
const SKIP = /\.(example|sample|template)$/

export function loadEnvSecrets(cwd: string): string[] {
  let names: string[]
  try {
    names = readdirSync(cwd).filter((n) => ENV_FILE.test(n) && !SKIP.test(n))
  } catch {
    return []
  }
  const values = new Set<string>()
  for (const name of names) {
    let text: string
    try {
      text = readFileSync(join(cwd, name), 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/)
      if (!m) continue
      const v = (m[1] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2')
      if (v.length >= 6) values.add(v)
    }
  }
  return [...values]
}
