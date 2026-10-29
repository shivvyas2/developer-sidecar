import { CONCEPTS, conceptOfBuilding, conceptOfScene, inYourProject, sceneOf, type CityTown, type ConceptId, type FeedStep } from '@sidecar/shared'

/** Everything a concept card shows, from the analogy down to this project's real files and steps. */
export interface ConceptCardView {
  id: ConceptId
  city: string
  layer1: string
  layer2: string
  files: string[]
  steps: { id: string; caption: string }[]
  related: { id: ConceptId; city: string }[]
  glossaryTerm?: string
}

export function cardFor(id: ConceptId, town: CityTown, steps: readonly Pick<FeedStep, 'id' | 'caption'>[]): ConceptCardView {
  const c = CONCEPTS[id]
  const mine = inYourProject(id, town)
  const ids = new Set(mine.stepIds)
  return {
    id, city: c.city, layer1: c.analogy, layer2: c.real, files: mine.files,
    steps: steps.filter((s) => ids.has(s.id)).map((s) => ({ id: s.id, caption: s.caption })),
    related: c.related.map((r) => ({ id: r, city: CONCEPTS[r].city })),
    ...(c.glossaryTerm ? { glossaryTerm: c.glossaryTerm } : {}),
  }
}

/** The concept behind what was tapped: a building's, or the kind of work a step's scene shows. */
export function conceptAt(target: { building?: string; stepId?: string }, town: CityTown, steps: readonly FeedStep[]): ConceptId | null {
  if (target.building) {
    const b = town.buildings.find((x) => x.id === target.building)
    return b ? conceptOfBuilding(b) : null
  }
  const s = target.stepId ? steps.find((x) => x.id === target.stepId) : undefined
  return s ? conceptOfScene(sceneOf(s, town).kind) : null
}
