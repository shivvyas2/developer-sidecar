// Builds the folder the `release` branch holds: the built plugin, ready to install, and nothing from source.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Paths inside plugin/ a working install needs. dist/web/ is copied whole beside them. */
export const REQUIRED = [
  '.claude-plugin/plugin.json',
  'hooks/hooks.json',
  'dist/emit.cjs',
  'dist/start-server.cjs',
  'dist/server.cjs',
  'dist/locate.cjs',
  'dist/mod/register.js',
  'dist/web/index.html',
]

const ROOT_README = `# Developer Sidecar (release build)

This branch holds the built plugin that the Claude Code marketplace installs. It is written by CI on each tagged release. The source, issues and docs live on the main branch: https://github.com/shivvyas2/developer-sidecar
`

export function assemble(repoRoot, outDir) {
  const plugin = join(repoRoot, 'plugin')
  const missing = REQUIRED.filter((p) => !existsSync(join(plugin, p)))
  if (missing.length) throw new Error(`release tree: missing ${missing.join(', ')} (run pnpm build first)`)
  rmSync(outDir, { recursive: true, force: true })
  const target = join(outDir, 'plugin')
  mkdirSync(target, { recursive: true })
  cpSync(join(plugin, '.claude-plugin'), join(target, '.claude-plugin'), { recursive: true })
  mkdirSync(join(target, 'hooks'), { recursive: true })
  cpSync(join(plugin, 'hooks/hooks.json'), join(target, 'hooks/hooks.json'))
  cpSync(join(plugin, 'dist'), join(target, 'dist'), { recursive: true })
  cpSync(join(repoRoot, 'README.md'), join(target, 'README.md'))
  cpSync(join(repoRoot, 'LICENSE'), join(target, 'LICENSE'))
  writeFileSync(join(outDir, 'README.md'), ROOT_README)
  return [...REQUIRED, 'dist/', 'README.md', 'LICENSE']
}

export function changelogSection(text, version) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`))
  if (start < 0) throw new Error(`CHANGELOG has no section for ${version}`)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => l.startsWith('## '))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim()
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = resolve(import.meta.dirname, '..')
  if (process.argv[2] === 'notes') {
    process.stdout.write(changelogSection(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), process.argv[3] ?? '') + '\n')
  } else {
    assemble(root, join(root, 'release-tree'))
    console.log('release-tree/ ready')
  }
}
