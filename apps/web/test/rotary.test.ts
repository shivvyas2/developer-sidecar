import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { RotarySelect } from '../src/ds'

const options = [{ value: 'off', label: 'OFF' }, { value: 'on', label: 'ON' }]
const html = (extra: object) => renderToStaticMarkup(createElement(RotarySelect<string>, { label: 'Level', value: 'off', options, onChange: () => {}, ...extra }))

test('a busy, disabled rotary announces nothing as selected', () => {
  const h = html({ disabled: true, busy: true })
  expect(h).toMatch(/role="radiogroup"[^>]*aria-disabled="true"/)
  expect(h).toMatch(/role="radiogroup"[^>]*aria-busy="true"/)
  expect(h).not.toContain('aria-checked="true"')
  expect((h.match(/role="radio"[^>]*aria-disabled="true"/g) ?? []).length).toBe(2)
})

test('a ready rotary checks its value and is not busy', () => {
  const h = html({})
  expect(h).toContain('aria-checked="true"')
  expect(h).not.toContain('aria-busy')
  expect(h).not.toContain('aria-disabled')
})
