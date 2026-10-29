import { expect, test } from 'vitest'
import { ellipsis } from '../src/text'

test('ellipsis cuts text over the limit to the limit, its last character an ellipsis, and leaves shorter text alone', () => {
  expect(ellipsis('abcdef', 4)).toBe('abc…')
  expect(ellipsis('abcdef', 4)).toHaveLength(4)
  expect(ellipsis('abcd', 4)).toBe('abcd')
  expect(ellipsis('', 4)).toBe('')
})
