import type { MapKind, MapState, ProjectMap } from '@sidecar/shared'
import { stepNumber } from './selection'

export interface BoardItem {
  id: string
  name: string
  state: MapState
  /** What the state means, in plain words. */
  stateText: string
  files: string[]
  /** The steps that touched this part: their id and their number on the Stage, oldest first. */
  steps: Array<{ id: string; num: string }>
  /** Claude's newest step touched it. */
  live: boolean
}

export interface BoardSection { kind: MapKind; title: string; items: BoardItem[] }

export const STATE_TEXT: Record<MapState, string> = { seen: 'looked at', changed: 'made or changed', failed: 'needs a fix' }

/** At most this many step links per part; a part touched by more says how many more. */
export const MAX_STEP_LINKS = 8

/**
 * The Whiteboard's view of the project map: each part with its state in words, its files and the
 * numbered steps that touched it. `stepIds` is the session's steps in order; `liveId` the newest.
 */
export function boardFrom(map: ProjectMap, stepIds: readonly string[], liveId: string | null): BoardSection[] {
  const index = new Map(stepIds.map((id, i) => [id, i]))
  return map.sections.map((s) => ({
    kind: s.kind,
    title: s.title,
    items: s.items.map((i) => ({
      id: i.id,
      name: i.name,
      state: i.state,
      // a package isn't made, it's added
      stateText: s.kind === 'blocks' && i.state === 'changed' ? 'added' : STATE_TEXT[i.state],
      files: i.files,
      steps: i.stepIds.filter((id) => index.has(id)).map((id) => ({ id, num: stepNumber(index.get(id)!) })),
      live: liveId !== null && i.stepIds.includes(liveId),
    })),
  }))
}
