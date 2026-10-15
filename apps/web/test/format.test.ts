import { expect, test } from 'vitest'
import { formatTokens } from '../src/format'

test('formatTokens', () => {
  expect([0, 950, 1234, 12_345, 3_400_000].map(formatTokens)).toEqual(['0', '950', '1.2k', '12k', '3.4M'])
})
