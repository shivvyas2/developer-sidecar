import type { Category, PlaceId, ProjectMap, SceneSpec, StepStatus } from '@sidecar/shared'

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

/**
 * Real names from the project map on the town: the service block reads STRIPE, the database lists
 * its first table (ORDERS), the packages say how many were added. A service, data or packages the
 * map knows about join the town even before a scene used them. A step's own scene labels still win
 * while it plays (see makeCtx).
 */
export function nameTown(town: Town, map: ProjectMap): Town {
  const items = (kind: string) => map.sections.find((s) => s.kind === kind)?.items ?? []
  const service = items('service')[0]?.name
  const table = items('data').find((i) => i.id.startsWith('data:table:'))
  const blocks = items('blocks').filter((i) => i.state !== 'seen').length
  const places = [...town.places]
  const labels = { ...town.labels }
  if (service) {
    if (!places.includes('service')) places.push('service')
    labels.service ??= service
  }
  if (items('data').length) {
    if (!places.includes('database')) places.push('database')
    if (table) labels.database ??= table.name.replace(/ table$/, '')
  }
  if (blocks) {
    if (!places.includes('toolbox')) places.push('toolbox')
    labels.toolbox ??= `${blocks} ADDED`
  }
  return { ...town, places, labels }
}
