import type { Category, PlaceId, SceneSpec, StepStatus } from '@sidecar/shared'

export interface Town {
  places: PlaceId[]
  labels: Partial<Record<PlaceId, string>>
  appFloors: number
}

export const MAX_FLOORS = 5
export const FILES_PER_FLOOR = 3
export const emptyTown: Town = { places: [], labels: {}, appFloors: 1 }

export interface TownStep { category: Category; status: StepStatus; scene: SceneSpec }

/** The persistent stage for a project, built from every step so far. */
export function townFrom(steps: readonly TownStep[]): Town {
  const places: PlaceId[] = ['app']
  const labels: Partial<Record<PlaceId, string>> = {}
  let created = 0
  for (const s of steps) {
    if (s.category === 'create' && s.status === 'ok') created++
    const cast: unknown = s.scene?.cast
    if (!Array.isArray(cast)) continue
    for (const c of cast as TownStep['scene']['cast']) {
      if (typeof c === 'string') continue
      if (!places.includes(c.place)) places.push(c.place)
      if (c.label) labels[c.place] = c.label
    }
  }
  return { places, labels, appFloors: Math.min(MAX_FLOORS, 1 + Math.floor(created / FILES_PER_FLOOR)) }
}
