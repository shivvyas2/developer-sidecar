import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import ignore from 'ignore'
import type { Baseline, GitInfo } from '@sidecar/shared'

/**
 * One look at a session's project folder, so the city can draw the project as it already stands.
 * It reads names only: file and folder names, plus the dependency manifests, `.gitignore` and
 * `.git/config`. It never opens any other file, and never a `.env` file.
 */

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo', 'coverage', '.venv', 'venv', '__pycache__',
  '.svelte-kit', '.vercel', '.cache', 'target',
])
const LOCKFILES = new Set([
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'poetry.lock', 'uv.lock',
  'Cargo.lock', 'Gemfile.lock', 'composer.lock',
])
export const SCAN_CAP = 5000

export interface ScanOptions {
  /** Most files listed before the remaining folders stand in for theirs. */
  cap?: number
  now?: () => number
  /** Reads one of the few files the scan opens; injectable so tests can see what was opened. */
  read?: (path: string) => Promise<string>
}

/** owner and name from an https or ssh remote URL, or null when it is not one. */
export function parseRemote(url: string): GitInfo['remote'] {
  const m = url.trim().match(/^(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|[^@/\s]+@)([^/:\s]+)[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/)
  return m ? { host: m[1]!.toLowerCase(), owner: m[2]!, name: m[3]! } : null
}

const nameOf = (spec: string): string => spec.trim().split(/[\s<>=!~;[(@]/)[0]!.trim()

function npmPackages(text: string): string[] {
  try {
    const pkg = JSON.parse(text) as Record<string, unknown>
    return ['dependencies', 'devDependencies'].flatMap((k) => (pkg[k] && typeof pkg[k] === 'object' ? Object.keys(pkg[k]) : []))
  } catch {
    return []
  }
}
const requirements = (text: string): string[] =>
  text.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter((l) => l && !l.startsWith('-')).map(nameOf).filter(Boolean)
function pyproject(text: string): string[] {
  // the list ends at a bracket on its own line or after the last quoted entry, not at extras like uvicorn[standard]
  const block = text.match(/^\s*dependencies\s*=\s*\[((?:\s*["'][^"']*["']\s*,?)*)\s*\]/m)?.[1] ?? ''
  return [...block.matchAll(/["']([^"']+)["']/g)].map((m) => nameOf(m[1]!)).filter(Boolean)
}

async function isDir(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory() } catch { return false }
}
async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

export async function scanProject(cwd: string, opts: ScanOptions = {}): Promise<Baseline | null> {
  if (!cwd || !(await isDir(cwd))) return null
  const cap = opts.cap ?? SCAN_CAP
  const read = async (rel: string): Promise<string | null> => {
    try { return await (opts.read ?? ((p: string) => readFile(p, 'utf8')))(join(cwd, rel)) } catch { return null }
  }

  const gitignore = await read('.gitignore')
  const ig = ignore()
  if (gitignore) ig.add(gitignore)
  const ignored = (rel: string) => { try { return ig.ignores(rel) } catch { return false } }

  const files: string[] = []
  const folders = new Set<string>()
  let truncated = false
  const queue = ['']
  while (queue.length) {
    const dir = queue.shift()!
    let entries
    try { entries = await readdir(join(cwd, dir), { withFileTypes: true }) } catch { continue }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      const rel = dir ? `${dir}/${e.name}` : e.name
      if (e.isSymbolicLink()) continue
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !ignored(`${rel}/`)) queue.push(rel)
      } else if (e.isFile() && !LOCKFILES.has(e.name) && !ignored(rel)) {
        if (files.length < cap) files.push(rel)
        else { truncated = true; if (dir) folders.add(dir.split('/')[0]!) }
      }
    }
    if (truncated) { for (const d of queue) folders.add(d.split('/')[0]!); break }
  }

  const packages = [...new Set([
    ...npmPackages((await read('package.json')) ?? ''),
    ...requirements((await read('requirements.txt')) ?? ''),
    ...pyproject((await read('pyproject.toml')) ?? ''),
  ])]

  const repo = await exists(join(cwd, '.git'))
  const config = repo ? await read('.git/config') : null
  const url = config?.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/)?.[1] ?? config?.match(/\burl\s*=\s*(\S+)/)?.[1]
  const git: GitInfo = {
    repo,
    remote: url ? parseRemote(url) : null,
    ignoresSecrets: !!gitignore && ignored('.env') && ignored('.env.local'),
    ignoresDeps: !!gitignore && ignored('node_modules/'),
    ignoresBuild: !!gitignore && (ignored('dist/') || ignored('build/') || ignored('.next/')),
    readme: files.some((f) => /^readme(\.|$)/i.test(f)),
  }

  return { files: files.sort(), packages, folders: [...folders].sort(), truncated, git, scannedAt: (opts.now ?? Date.now)() }
}
