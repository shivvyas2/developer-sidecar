import { isRecord } from './hook-payload'
import { INSTALL, packagesIn, segments } from './shell'
import type { FeedStep } from './step'
import { detectVendor } from './vendors'

/**
 * "What you're building": the parts of a project a session has looked at or changed, sorted into
 * plain sections and named from paths, packages and services. Built from steps alone, with no model.
 */

export type MapKind = 'page' | 'backend' | 'data' | 'service' | 'secrets' | 'checks' | 'code' | 'blocks'

/** seen: Claude only looked at it. changed: Claude made or changed it. failed: the last change to it failed. */
export type MapState = 'seen' | 'changed' | 'failed'

export interface MapItem {
  id: string
  name: string
  /** Paths relative to the project, in the order they were first touched. */
  files: string[]
  stepIds: string[]
  state: MapState
}

export interface MapSection { kind: MapKind; title: string; items: MapItem[] }

export interface ProjectMap { sections: MapSection[] }

export const MAP_TITLES: Record<MapKind, string> = {
  page: 'Pages and screens',
  backend: 'Behind the scenes',
  data: 'Your data',
  service: 'Outside services',
  secrets: 'Secret settings',
  checks: 'Checks',
  code: 'Helpers',
  blocks: 'Building blocks',
}
const ORDER: MapKind[] = ['page', 'backend', 'data', 'service', 'secrets', 'checks', 'code', 'blocks']

type MapStep = Pick<FeedStep, 'id' | 'category' | 'status' | 'toolName' | 'input'>

const CHECKS = /\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$|(^|\/)(__tests__|e2e)\//
const SECRETS = /(^|\/)\.env(\.[\w.-]+)?$/
const DATA = /(^|\/)(schema\.prisma|schema\.[cm]?[jt]s|models?\.py|db\.[cm]?[jt]s|database\.[cm]?[jt]s)$|(^|\/)(migrations?|prisma|drizzle)\/|\.sql$/
const BACKEND = /(^|\/)(app|src\/app)\/(.+\/)?api\/|(^|\/)pages\/api\/|(^|\/)(server|api|backend|functions)\/|(^|\/)route\.[cm]?[jt]s$|(^|\/)\+server\.[jt]s$/
const PAGE = /(^|\/)(app|src\/app)\/(.+\/)?(page|layout)\.[jt]sx?$|(^|\/)(pages|src\/routes|routes|screens|views|components)\/|\.(html|vue|svelte|astro)$|\.[jt]sx$|\.css$/
const CODE = /\.(c|m)?[jt]sx?$|\.(py|rb|go|rs|php|java|kt|swift)$/

const ENV_IN_COMMAND = /(?:^|[\s/'"=])(\.env(?:\.[\w.-]+)?)(?=$|[\s'";|&>)])/

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const basename = (p: string) => p.split('/').pop() ?? p
const stem = (p: string) => basename(p).replace(/\.[^.]+$/, '').replace(/\.(test|spec)$/, '')

/** "BuyButton", "buy-button" and "buy_button" all read "Buy button". */
export function humanize(s: string): string {
  const words = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_.\s]+/g, ' ').trim().toLowerCase()
  return words ? words[0]!.toUpperCase() + words.slice(1) : ''
}

/** The route folders under app/ or pages/, without route groups like (shop) or dynamic [id] brackets. */
function routeName(rel: string): string {
  const m = rel.match(/(?:^|\/)(?:src\/)?(?:app|pages)\/(.*)$/)
  const folders = (m?.[1] ?? '').split('/').slice(0, -1).filter((f) => f && !/^\(.*\)$/.test(f) && f !== 'api')
  return folders.map((f) => f.replace(/^\[+\.*|\]+$/g, '')).join(' ')
}

function classify(rel: string): { kind: MapKind; key: string; name: string } | null {
  const file = basename(rel)
  if (SECRETS.test(rel)) return { kind: 'secrets', key: file, name: file }
  if (CHECKS.test(rel)) return { kind: 'checks', key: rel, name: `${humanize(stem(rel) === 'route' ? routeName(rel) || 'route' : stem(rel))} checks` }
  if (DATA.test(rel)) {
    if (/(^|\/)db\.|database\./.test(file)) return { kind: 'data', key: 'connection', name: 'Database connection' }
    return { kind: 'data', key: 'tables', name: 'Database tables' }
  }
  const vendor = detectVendor(stem(rel))
  if (vendor && CODE.test(rel)) return { kind: 'service', key: vendor, name: vendor }
  if (BACKEND.test(rel)) {
    const route = routeName(rel)
    const name = humanize(route || (/^(route|index|\+server)$/.test(stem(rel)) ? basename(rel.replace(/\/[^/]+$/, '')) : stem(rel)))
    return { kind: 'backend', key: name.toLowerCase(), name: name || 'Server code' }
  }
  if (PAGE.test(rel)) {
    if (/(^|\/)(app|src\/app)\/(.+\/)?layout\.[jt]sx?$/.test(rel)) return { kind: 'page', key: `layout:${routeName(rel)}`, name: routeName(rel) ? `${humanize(routeName(rel))} layout` : 'Site layout' }
    if (/(^|\/)(app|src\/app)\/(.+\/)?page\.[jt]sx?$|(^|\/)pages\//.test(rel)) {
      const route = routeName(rel) || (/(^|\/)pages\//.test(rel) && !/^index$/.test(stem(rel)) ? stem(rel) : '')
      return { kind: 'page', key: `page:${route}`, name: route ? `${humanize(route)} page` : 'Home page' }
    }
    if (/(^|\/)\+page\.svelte$/.test(rel)) {
      const route = (rel.match(/(?:^|\/)routes\/(.*)\/\+page\.svelte$/)?.[1] ?? '').split('/').filter((f) => f && !/^\(.*\)$/.test(f)).map((f) => f.replace(/^\[+\.*|\]+$/g, '')).join(' ')
      return { kind: 'page', key: `page:${route}`, name: route ? `${humanize(route)} page` : 'Home page' }
    }
    if (/\.css$/.test(rel)) return { kind: 'page', key: 'styles', name: 'Styles' }
    return { kind: 'page', key: rel, name: humanize(stem(rel)) }
  }
  if (CODE.test(rel)) return { kind: 'code', key: rel, name: humanize(stem(rel)) }
  return null
}

/** Table names a schema file declares (Drizzle, Prisma, SQL, Mongoose), from the text Claude wrote. */
export function tablesIn(text: string): string[] {
  const out = new Set<string>()
  const patterns = [
    /\b(?:pg|sqlite|mysql)Table\(\s*['"`]([A-Za-z_]\w*)/g,
    /^\s*model\s+([A-Za-z_]\w*)\s*\{/gm,
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?["`[]?([A-Za-z_]\w*)/gi,
    /\bmodel\(\s*['"`]([A-Za-z_]\w*)/g,
  ]
  for (const re of patterns) for (const m of text.matchAll(re)) out.add(m[1]!.toLowerCase())
  return [...out].slice(0, 12)
}

const WRITES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
/** A step that made or changed something; anything else (a read, cat .env, a search) only looked. */
const changes = (s: MapStep) => WRITES.has(s.toolName) || s.category === 'install'

/**
 * The project map for a session's steps. `cwd` (the session's folder) makes paths relative; without
 * it, paths are matched by the folders in them. Running and interrupted steps count as touching a
 * part but never change its state.
 */
export function projectMap(steps: readonly MapStep[], cwd?: string): ProjectMap {
  const items = new Map<string, MapItem & { kind: MapKind }>()
  const root = cwd ? cwd.replace(/\/+$/, '') + '/' : ''
  const rel = (p: string) => (root && p.startsWith(root) ? p.slice(root.length) : p.replace(/^\/+/, ''))

  const touch = (kind: MapKind, key: string, name: string, step: MapStep, file?: string) => {
    const id = `${kind}:${key}`
    const item = items.get(id) ?? { id, kind, name, files: [], stepIds: [], state: 'seen' as MapState }
    if (file && !item.files.includes(file)) item.files.push(file)
    if (!item.stepIds.includes(step.id)) item.stepIds.push(step.id)
    const finished = step.status === 'ok' || step.status === 'failed'
    if (finished && changes(step)) item.state = step.status === 'failed' ? 'failed' : 'changed'
    items.set(id, item)
  }

  for (const step of steps) {
    if (step.category === 'prompt') continue
    const input = isRecord(step.input) ? step.input : {}
    const path = str(input.file_path) || str(input.notebook_path)
    const command = step.toolName === 'Bash' ? str(input.command) : ''

    if (path) {
      const r = rel(path)
      const c = classify(r)
      if (c) touch(c.kind, c.key, c.name, step, r)
      if (c?.kind === 'data' && c.key === 'tables') {
        for (const t of tablesIn([str(input.content), str(input.new_string)].join('\n'))) touch('data', `table:${t}`, `${humanize(t)} table`, step, r)
      }
      const vendor = detectVendor(stem(r))
      if (vendor && c?.kind !== 'service' && CODE.test(r)) touch('service', vendor, vendor, step, r)
    }
    if (command) {
      for (const part of segments(command)) {
        if (!INSTALL.test(part)) continue
        for (const pkg of packagesIn(part)) {
          const name = pkg.replace(/(.)@[^/]*$/, '$1')
          touch('blocks', name, name, step)
          const vendor = detectVendor(name)
          if (vendor) touch('service', vendor, vendor, step)
        }
      }
      const env = command.match(ENV_IN_COMMAND)?.[1]
      if (env) touch('secrets', env, env, step)
    }
    const url = str(input.url)
    const vendor = url ? detectVendor(url) : undefined
    if (vendor) touch('service', vendor, vendor, step)
  }

  const sections = ORDER
    .map((kind) => ({ kind, title: MAP_TITLES[kind], items: [...items.values()].filter((i) => i.kind === kind).map(({ kind: _k, ...i }) => i) }))
    .filter((s) => s.items.length > 0)
  return { sections }
}
