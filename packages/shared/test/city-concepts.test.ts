import { describe, expect, test } from 'vitest'
import { CONCEPTS, CONCEPT_IDS, conceptOfBuilding, conceptOfScene, inYourProject } from '../src/city/concepts'
import type { SceneKind } from '../src/city/scenes'
import { townOf, type BuildingKind, type TownInputStep } from '../src/city/town'

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F}/u

describe('concept copy', () => {
  test('every concept has an entry with plain text in every layer', () => {
    for (const id of CONCEPT_IDS) {
      const c = CONCEPTS[id]
      expect(c.id).toBe(id)
      for (const text of [c.city, c.analogy, c.real]) {
        expect(text.trim()).not.toBe('')
        expect(text).not.toMatch(/—/)
        expect(text).not.toMatch(EMOJI)
      }
      expect(c.real.length).toBeLessThanOrEqual(320)
    }
  })
  test('every related idea exists and is not the concept itself', () => {
    for (const id of CONCEPT_IDS) for (const r of CONCEPTS[id].related) {
      expect(CONCEPT_IDS).toContain(r)
      expect(r).not.toBe(id)
    }
  })
  test('the launch list is all there', () => {
    expect(CONCEPT_IDS).toEqual(expect.arrayContaining([
      'reading', 'packages', 'files', 'tests', 'build', 'pages', 'styling', 'backend', 'api', 'database', 'table', 'migration', 'cache',
      'requests', 'login', 'secrets', 'services', 'jobs', 'hosting', 'repository', 'commit', 'branch', 'push', 'pull', 'pullRequest',
      'merge', 'github', 'gitignore', 'deploy', 'domain', 'devServer', 'helpers', 'permissions', 'errors',
    ]))
  })
})

describe('what each thing in the town stands for', () => {
  const kinds: BuildingKind[] = ['shop', 'office', 'workshop', 'warehouse', 'service', 'vault', 'inspector', 'yard', 'archive', 'siteOffice']
  test.each(kinds)('%s has a concept', (kind) => {
    expect(CONCEPT_IDS).toContain(conceptOfBuilding({ id: 'x', kind, name: 'x', mapId: null, finish: 'built', files: [], stepIds: [], lit: false }))
  })
  const scenes: SceneKind[] = ['blueprint', 'bricks', 'scaffold', 'paint', 'delivery', 'inspect', 'pour', 'lightsOn', 'lightsOff', 'toolbox',
    'library', 'cable', 'photo', 'branch', 'pushTruck', 'pullTruck', 'proposal', 'merge', 'forklift', 'ribbon', 'helpers', 'workOrder']
  test.each(scenes)('%s has a concept', (k) => expect(CONCEPT_IDS).toContain(conceptOfScene(k)))
  test('services by what they do', () => {
    const svc = (vendorKind: 'hosting' | 'login' | 'payments' | 'database') =>
      conceptOfBuilding({ id: 'x', kind: 'service', name: 'x', mapId: null, vendorKind, finish: 'built', files: [], stepIds: [], lit: false })
    expect(svc('hosting')).toBe('hosting')
    expect(svc('login')).toBe('login')
    expect(svc('payments')).toBe('services')
    expect(svc('database')).toBe('database')
  })
})

test('in your project: the database card lists the warehouse files and the steps that touched them', () => {
  const steps: TownInputStep[] = [
    { id: 'a', toolName: 'Write', category: 'create', status: 'ok', input: { file_path: '/p/prisma/schema.prisma', content: 'model Order {}' } },
    { id: 'b', toolName: 'Read', category: 'read', status: 'ok', input: { file_path: '/p/app/page.tsx' } },
    { id: 'c', toolName: 'Edit', category: 'edit', status: 'ok', input: { file_path: '/p/prisma/schema.prisma', old_string: 'a', new_string: 'b' } },
  ]
  const r = inYourProject('database', townOf(steps, { cwd: '/p' }))
  expect(r.files).toEqual(['prisma/schema.prisma'])
  expect(r.stepIds).toEqual(['a', 'c'])
  expect(inYourProject('deploy', townOf(steps, { cwd: '/p' }))).toEqual({ files: [], stepIds: [] })
})
