import { expect, test } from 'vitest'
import { SIDECAR_NAME } from '@sidecar/shared'

test('workspace package resolves', () => {
  expect(SIDECAR_NAME).toBe('developer-sidecar')
})
