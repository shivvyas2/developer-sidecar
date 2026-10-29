import { isRecord } from '../hook-payload'
import { fileOf, str } from '../input'
import { humanize, makesChange, projectMap, type MapKind, type MapItem } from '../project-map'
import { serverUrl } from '../recap'
import { segments } from '../shell'
import { isStopped, type FeedStep } from '../step'
import { covers } from '../story'
import { vendorKind, type VendorKind } from '../vendors'
import type { Baseline, GitInfo } from './baseline'

/**
 * The town: the project as buildings, how far it has grown, and how each building is finished.
 * Built from the steps and the project scan alone, with no model.
 */

export type GrowthStage = 'lot' | 'dig' | 'foundation' | 'bricks' | 'concrete' | 'walls' | 'neighbours' | 'neighbourhood' | 'town'
export const GROWTH_STAGES: readonly GrowthStage[] = ['lot', 'dig', 'foundation', 'bricks', 'concrete', 'walls', 'neighbours', 'neighbourhood', 'town']

export type BuildingKind = 'shop' | 'office' | 'workshop' | 'warehouse' | 'service' | 'vault' | 'inspector' | 'yard' | 'archive' | 'siteOffice'

/**
 * built: it was already there, or Claude only looked at it. rising: the change making it is running now. unpainted:
 * made or changed since the last passing check. painted: a check passed after its last change. smoking: a check
 * failed after it changed, or its own change failed. fixed: it was smoking and a later run put it right.
 */
export type Finish = 'built' | 'rising' | 'unpainted' | 'painted' | 'smoking' | 'fixed'

export interface Building {
  id: string
  kind: BuildingKind
  name: string
  /** The project map item it stands for, or null for the inspector, archive and site office when no item does. */
  mapId: string | null
  vendorKind?: VendorKind
  finish: Finish
  files: string[]
  stepIds: string[]
  /** A dev server is up, so the shop's lights are on. */
  lit: boolean
}

export interface CityTown { stage: GrowthStage; buildings: Building[]; git: GitInfo | null; files: number }

export type TownInputStep = Pick<FeedStep, 'id' | 'category' | 'status' | 'toolName' | 'input'> & Partial<Pick<FeedStep, 'output'>>

const SITE_OFFICE = 'site-office'
const CONFIG = /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|Gemfile|go\.mod|Cargo\.toml|tsconfig[\w.-]*\.json|(vite|next|astro|svelte|nuxt)\.config\.[cm]?[jt]s)$/
/** Build commands: a package script named build, the TypeScript compiler, a framework's build, or make. */
const BUILDS = [
  /(^|\s)(npm|pnpm|yarn|bun)\s+(run\s+)?build(\s|:|$)/,
  /(^|\s)(npx\s+|pnpm\s+exec\s+|yarn\s+)?tsc(\s|$)/,
  /(^|\s)(npx\s+)?(vite|next|nuxt|astro|remix|gatsby|svelte-kit|turbo)\s+build(\s|$)/,
  /(^|\s)(cargo|go|swift|dotnet|gradle|\.\/gradlew)\s+build(\s|$)/,
  /^make(\s|$)/,
]
export const isBuildCommand = (command: string): boolean => segments(command).some((p) => BUILDS.some((re) => re.test(p.trim())))
/** Worst first: what a building shows when its parts disagree. */
const RANK: Finish[] = ['smoking', 'rising', 'unpainted', 'fixed', 'painted', 'built']

const commandOf = (s: TownInputStep) => (s.toolName === 'Bash' && isRecord(s.input) ? str(s.input.command) : '')
const finished = (s: TownInputStep) => (s.status === 'ok' || s.status === 'failed') && !isStopped(s)
/** A check: a test run, or a build command run. */
const isCheck = (s: TownInputStep) => s.category === 'test' || (s.category === 'run' && isBuildCommand(commandOf(s)))

/** A path the step names that is not inside the project folder, such as ~/.zshrc, /tmp/x.ts or C:\tmp\a.ts. */
function outside(s: TownInputStep, cwd?: string): boolean {
  if (!cwd || !isRecord(s.input)) return false
  const path = fileOf(s.input)
  if (!path) return false
  const root = cwd.replace(/\/+$/, '') + '/'
  return (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) && !path.startsWith(root)
}

interface Part { finish: Finish; failedBy?: string }

/** Most shops and workshops a town draws; the rest share one last building. */
export const MAX_SHOPS = 40
export const MAX_WORKSHOPS = 12

type Item = MapItem & { kind: MapKind }
/** The first folder of an item's first file, or '' for a file at the top of the project. */
const topFolder = (i: Item) => { const f = i.files[0] ?? ''; return f.includes('/') ? f.split('/')[0]! : '' }
const folderName = (folder: string) => (folder ? humanize(folder) : 'Helpers')
function groupBy(items: Item[], key: (i: Item) => string): [string, Item[]][] {
  const out = new Map<string, Item[]>()
  for (const i of items) { const k = key(i); const list = out.get(k); if (list) list.push(i); else out.set(k, [i]) }
  return [...out]
}

export function townOf(all: readonly TownInputStep[], opts: { cwd?: string; baseline?: Baseline } = {}): CityTown {
  const steps = all.filter((s) => !outside(s, opts.cwd))
  const map = projectMap(steps, opts.cwd, opts.baseline)
  const items = map.sections.flatMap((sec) => sec.items.map((i) => ({ ...i, kind: sec.kind })))

  // which parts each step touched, so finishes can follow the steps in order
  const partsOf = new Map<string, string[]>()
  for (const i of items) for (const id of i.stepIds) { const list = partsOf.get(id); if (list) list.push(i.id); else partsOf.set(id, [i.id]) }

  const parts = new Map<string, Part>(items.map((i) => [i.id, { finish: 'built' }]))
  const inspector: Part = { finish: 'built' }
  let pending = new Set<string>()
  const newest = steps.filter((s) => s.category !== 'prompt').at(-1)

  for (const s of steps) {
    if (s.category === 'prompt') {
      for (const p of [...parts.values(), inspector]) if (p.finish === 'fixed') p.finish = 'painted'
      continue
    }
    const touched = partsOf.get(s.id) ?? []
    if (makesChange(s)) {
      if (s.status === 'running' && s === newest) for (const id of touched) parts.get(id)!.finish = 'rising'
      if (!finished(s)) continue
      for (const id of touched) {
        const p = parts.get(id)!
        if (s.status === 'failed') { p.finish = 'smoking'; p.failedBy = `write:${id}` }
        else if (p.failedBy === `write:${id}`) { p.finish = 'fixed'; delete p.failedBy }
        else if (p.finish !== 'smoking') p.finish = 'unpainted'
        pending.add(id)
      }
      continue
    }
    if (!isCheck(s) || !finished(s)) continue
    const command = commandOf(s)
    if (s.status === 'ok') {
      for (const p of [...parts.values(), inspector]) {
        if (p.finish === 'smoking' && p.failedBy && !p.failedBy.startsWith('write:') && (covers(command, p.failedBy) || command === p.failedBy)) {
          p.finish = 'fixed'; delete p.failedBy
        }
      }
      for (const id of pending) { const p = parts.get(id)!; if (p.finish === 'unpainted') p.finish = 'painted' }
      pending = new Set()
    } else {
      for (const id of pending) { const p = parts.get(id)!; if (p.finish !== 'smoking') { p.finish = 'smoking'; p.failedBy = command } }
      inspector.finish = 'smoking'; inspector.failedBy = command
    }
  }

  const lit = serverUrl(steps as Parameters<typeof serverUrl>[0]) !== undefined
  const buildings: Building[] = []
  const worst = (fs: Finish[]): Finish => RANK.find((f) => fs.includes(f)) ?? 'built'
  const one = (id: string, kind: BuildingKind, name: string, group: Item[], extra: Partial<Building> = {}) => {
    if (!group.length) return
    buildings.push({
      id, kind, name, mapId: group[0]!.id,
      finish: worst(group.map((i) => parts.get(i.id)!.finish)),
      files: group.flatMap((i) => i.files), stepIds: [...new Set(group.flatMap((i) => i.stepIds))], lit: false, ...extra,
    })
  }
  const of = (k: MapKind) => items.filter((i) => i.kind === k)
  // routes get a shop each; other page parts (components, styles) share one per top folder
  const shops = groupBy(of('page'), (i) => (/^page:(page|layout):/.test(i.id) ? i.id : `group:${topFolder(i)}`))
  shops.forEach(([key, group], n) => {
    if (n >= MAX_SHOPS - 1 && shops.length > MAX_SHOPS) return
    one(`shop:${key}`, 'shop', key.startsWith('group:') ? folderName(key.slice(6)) : group[0]!.name, group, { lit })
  })
  if (shops.length > MAX_SHOPS) one('shop:more', 'shop', 'More pages', shops.slice(MAX_SHOPS - 1).flatMap(([, g]) => g), { lit })
  one('office', 'office', 'Behind the scenes', of('backend'))
  const workshops = groupBy(of('code'), (i) => topFolder(i))
  workshops.forEach(([folder, group], n) => {
    if (n >= MAX_WORKSHOPS - 1 && workshops.length > MAX_WORKSHOPS) return
    one(`workshop:${folder}`, 'workshop', folderName(folder), group)
  })
  if (workshops.length > MAX_WORKSHOPS) one('workshop:more', 'workshop', 'More helpers', workshops.slice(MAX_WORKSHOPS - 1).flatMap(([, g]) => g))
  one('warehouse', 'warehouse', 'Your data', of('data'))
  for (const i of of('service')) one(`service:${i.name}`, 'service', i.name, [i], { vendorKind: vendorKind(i.name) })
  one('vault', 'vault', 'Secret settings', of('secrets'))
  one('yard', 'yard', 'Building blocks', of('blocks'))

  const testSteps = steps.filter((s) => s.category === 'test').map((s) => s.id)
  const checks = of('checks')
  if (checks.length || testSteps.length) {
    buildings.push({
      id: 'inspector', kind: 'inspector', name: 'Checks', mapId: checks[0]?.id ?? null, finish: worst([inspector.finish, ...checks.map((i) => parts.get(i.id)!.finish)]),
      files: checks.flatMap((i) => i.files), stepIds: [...new Set([...checks.flatMap((i) => i.stepIds), ...testSteps])], lit: false,
    })
  }
  const gitSteps = steps.filter((s) => s.category === 'git').map((s) => s.id)
  if (opts.baseline?.git.repo || gitSteps.length) {
    buildings.push({ id: 'archive', kind: 'archive', name: 'Archive', mapId: null, finish: 'built', files: [], stepIds: gitSteps, lit: false })
  }
  buildings.push({ id: SITE_OFFICE, kind: 'siteOffice', name: 'Site office', mapId: null, finish: 'built', files: [], stepIds: [], lit: false })

  const work = steps.filter((s) => s.category !== 'prompt')
  const has = (k: MapKind) => of(k).length > 0
  const made = (re: RegExp) => work.some((s) => s.category === 'create' && s.status === 'ok' && isRecord(s.input) && re.test(fileOf(s.input) ?? ''))
  const reached: Record<GrowthStage, boolean> = {
    lot: true,
    dig: work.length > 0 || items.length > 0,
    foundation: work.some((s) => s.category === 'install' && s.status === 'ok') || made(CONFIG) || (opts.baseline?.files.length ?? 0) > 0 || has('blocks'),
    bricks: made(/\.[\w]+$/) || items.some((i) => i.state === 'existing' && i.kind !== 'blocks'),
    concrete: work.some((s) => isCheck(s) && s.status === 'ok' && !isStopped(s)),
    walls: has('page'),
    neighbours: has('backend') || has('data'),
    neighbourhood: has('service') || has('secrets'),
    town: work.some((s) => s.category === 'deploy' && s.status === 'ok'),
  }
  const stage = [...GROWTH_STAGES].reverse().find((g) => reached[g])!
  const files = (opts.baseline?.files.length ?? 0) + work.filter((s) => s.category === 'create' && s.status === 'ok').length

  return { stage, buildings, git: opts.baseline?.git ?? null, files }
}

const BY_CATEGORY: Partial<Record<FeedStep['category'], string>> = {
  test: 'inspector', install: 'yard', git: 'archive', prompt: SITE_OFFICE, subagent: SITE_OFFICE,
}

/** The building a step plays at: what it touched, or the place its kind of work happens, or the site office. */
export function buildingFor(step: TownInputStep, town: CityTown): string {
  const fixed = BY_CATEGORY[step.category]
  if (fixed && town.buildings.some((b) => b.id === fixed)) return fixed
  const order: BuildingKind[] = ['shop', 'office', 'warehouse', 'service', 'vault', 'workshop', 'inspector', 'yard']
  const hits = town.buildings.filter((b) => b.stepIds.includes(step.id))
  for (const k of order) { const b = hits.find((h) => h.kind === k); if (b) return b.id }
  if (step.category === 'deploy') return town.buildings.find((b) => b.kind === 'shop')?.id ?? SITE_OFFICE
  return SITE_OFFICE
}
