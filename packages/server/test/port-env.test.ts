import { expect, test } from 'vitest'
import { portFromEnv } from '../src/port-env'

test('SIDECAR_PORT picks the port; anything else falls back to the default search', () => {
  expect(portFromEnv({ SIDECAR_PORT: '7455' })).toBe(7455)
  expect(portFromEnv({})).toBeUndefined()
  for (const bad of ['', 'abc', '80', '70000', '7377.5', '-1']) expect(portFromEnv({ SIDECAR_PORT: bad })).toBeUndefined()
})
