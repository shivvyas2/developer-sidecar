import { isRecord } from '../hook-payload'
import { fileOf, str } from '../input'
import { localUrl } from '../recap'
import { segments, startsDevServer } from '../shell'
import { isStopped, type FeedStep } from '../step'
import { buildingFor, type CityTown } from './town'

/** What a step looks like in the town: a short piece of work at the building it touched. */

export type SceneKind =
  | 'blueprint' | 'bricks' | 'scaffold' | 'paint' | 'delivery' | 'inspect' | 'pour' | 'lightsOn' | 'lightsOff' | 'toolbox'
  | 'library' | 'cable' | 'photo' | 'branch' | 'pushTruck' | 'pullTruck' | 'proposal' | 'merge' | 'forklift' | 'ribbon'
  | 'helpers' | 'workOrder'

/** failed: it went wrong. stopped: the person cut it short, nothing broke. fixed: it put an earlier failure right. waiting: Claude needs your OK. */
export type Overlay = 'none' | 'failed' | 'stopped' | 'fixed' | 'waiting'

export interface CityScene {
  stepIds: string[]
  kind: SceneKind
  /** The building it plays at. */
  at: string
  overlay: Overlay
  caption: string
  /** How many steps it stands for: more than one when a burst was merged into it. */
  count: number
}

const BUILD = /\b(build|tsc|compile)\b/

function runKind(s: FeedStep, command: string): SceneKind {
  if (segments(command).some((p) => BUILD.test(p))) return 'pour'
  if (startsDevServer(command) || localUrl(s.output)) return 'lightsOn'
  return 'toolbox'
}

function gitKind(command: string): SceneKind {
  for (const p of segments(command)) {
    if (/\bgh\s+pr\s+create\b/.test(p)) return 'proposal'
    if (/\bgit\s+(checkout\s+-b|switch\s+-c|branch\s+(?!-)\S)/.test(p)) return 'branch'
    if (/\bgit\s+push\b/.test(p)) return 'pushTruck'
    if (/\bgit\s+pull\b/.test(p)) return 'pullTruck'
    if (/\b(git\s+merge|gh\s+pr\s+merge)\b/.test(p)) return 'merge'
  }
  return 'photo'
}

const STOPS = new Set(['KillShell', 'KillBash', 'TaskStop'])

function kindOf(s: FeedStep): SceneKind {
  if (STOPS.has(s.toolName)) return 'lightsOff'
  const command = s.toolName === 'Bash' && isRecord(s.input) ? str(s.input.command) : ''
  switch (s.category) {
    case 'read': return 'blueprint'
    case 'create': return 'bricks'
    case 'edit': return /\.(css|scss|sass|less)$/.test(isRecord(s.input) ? fileOf(s.input) ?? '' : '') ? 'paint' : 'scaffold'
    case 'install': return 'delivery'
    case 'test': return 'inspect'
    case 'run': return runKind(s, command)
    case 'external': return 'library'
    case 'mcp': return 'cable'
    case 'git': return gitKind(command)
    case 'data': return 'forklift'
    case 'deploy': return 'ribbon'
    case 'subagent': return 'helpers'
    case 'prompt': return 'workOrder'
    default: return 'toolbox'
  }
}

export function sceneOf(s: FeedStep, town: CityTown, opts: { cwd?: string; fixes?: boolean; waiting?: boolean } = {}): CityScene {
  const overlay: Overlay = opts.waiting ? 'waiting'
    : isStopped(s) ? 'stopped'
      : s.status === 'failed' ? 'failed'
        : opts.fixes ? 'fixed'
          : 'none'
  return { stepIds: [s.id], kind: kindOf(s), at: buildingFor(s, town), overlay, caption: s.caption, count: 1 }
}
