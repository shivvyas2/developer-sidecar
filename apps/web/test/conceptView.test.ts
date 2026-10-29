import { describe, expect, test } from 'vitest'
import { CONCEPTS, townOf, type FeedStep } from '@sidecar/shared'
import { cardFor } from '../src/city/conceptView'

let n = 0
const step = (toolName: string, category: FeedStep['category'], input: Record<string, unknown>, caption: string): FeedStep => ({
  id: `c${++n}`, sessionId: 'x', toolName, category, status: 'ok', input, startedAt: n, seq: n, caption, techLabel: toolName,
  scene: { scene: 'thinking', cast: [], beats: [], caption },
})
const steps = [
  step('Write', 'create', { file_path: '/p/prisma/schema.prisma', content: 'model Order {}' }, 'Set up the orders table'),
  step('Read', 'read', { file_path: '/p/app/page.tsx' }, 'Read the home page'),
  step('Edit', 'edit', { file_path: '/p/prisma/schema.prisma', old_string: 'a', new_string: 'b' }, 'Added a price to orders'),
]
const town = townOf(steps, { cwd: '/p' })

describe('cardFor', () => {
  test('the database card: analogy, what it is, its files and the steps that touched them in order', () => {
    const c = cardFor('database', town, steps)
    expect(c.layer1).toBe(CONCEPTS.database.analogy)
    expect(c.layer2).toBe(CONCEPTS.database.real)
    expect(c.city).toBe(CONCEPTS.database.city)
    expect(c.files).toEqual(['prisma/schema.prisma'])
    expect(c.steps).toEqual([{ id: steps[0]!.id, caption: 'Set up the orders table' }, { id: steps[2]!.id, caption: 'Added a price to orders' }])
  })
  test('related ideas come with their town names', () => {
    expect(cardFor('database', town, steps).related).toEqual(CONCEPTS.database.related.map((id) => ({ id, city: CONCEPTS[id].city })))
  })
  test('a concept with nothing in the project has empty lists, not missing ones', () => {
    const c = cardFor('deploy', town, steps)
    expect(c.files).toEqual([])
    expect(c.steps).toEqual([])
    expect(c.glossaryTerm).toBe(CONCEPTS.deploy.glossaryTerm)
  })
})

describe('conceptAt', () => {
  test('a building means its concept, a scene its step kind', async () => {
    const { conceptAt } = await import('../src/city/conceptView')
    expect(conceptAt({ building: 'warehouse' }, town, steps)).toBe('database')
    expect(conceptAt({ stepId: steps[1]!.id }, town, steps)).toBe('reading')
    expect(conceptAt({ building: 'nowhere' }, town, steps)).toBeNull()
  })
})
