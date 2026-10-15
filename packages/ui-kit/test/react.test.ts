import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { scenes } from '../src/catalog'
import { Scene, specKey, startTime } from '../src/react'
import { render } from '../src/render'

const spec = scenes.connect('Connecting to Stripe', 'Stripe', false)

test('server-renders the same SVG as render() at the given time', () => {
  const html = renderToStaticMarkup(createElement(Scene, { spec, at: 500 }))
  expect(html).toBe(`<div class="sk-stage">${render(spec, 500)}</div>`)
})

test('startTime: a fixed time wins; reduced motion jumps to the final frame (Review Focus 4)', () => {
  expect(startTime(300, true, 4000)).toBe(300)
  expect(startTime(undefined, true, 4000)).toBe(4000)
  expect(startTime(undefined, false, 4000)).toBe(0)
})

test('specKey is equal for equal specs and different otherwise (Review Focus 5)', () => {
  expect(specKey({ ...spec })).toBe(specKey(spec))
  expect(specKey(scenes.connect('Connecting to Stripe', 'Stripe', true))).not.toBe(specKey(spec))
})
