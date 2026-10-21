import { expect, test } from 'vitest'
import { basename, fileOf, str } from '../src/input'

test('str keeps strings and turns anything else into empty text', () => {
  expect([str('a'), str(1), str(undefined), str(null), str({})]).toEqual(['a', '', '', '', ''])
})

test('basename takes the last part of a path with either slash', () => {
  expect([basename('/p/app/page.tsx'), basename('C:\\shop\\app\\page.tsx'), basename('page.tsx'), basename('')]).toEqual(['page.tsx', 'page.tsx', 'page.tsx', ''])
})

test("fileOf reads a tool input's file, a notebook's too, and nothing from anything else", () => {
  expect(fileOf({ file_path: '/p/a.ts' })).toBe('/p/a.ts')
  expect(fileOf({ notebook_path: '/p/n.ipynb' })).toBe('/p/n.ipynb')
  expect(fileOf({ file_path: 3, pattern: 'x' })).toBe('')
  expect([fileOf(undefined), fileOf('a.ts'), fileOf(['a.ts'])]).toEqual(['', '', ''])
})
