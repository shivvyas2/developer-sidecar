import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MARK_INNER, markInner, shouldPlayIntro } from '../src/brand/mark'

const file = readFileSync(join(import.meta.dirname, '../src/brand/sidecar.svg'), 'utf8')

describe('the Sidecar mark', () => {
  it('is a self-contained square SVG with a name', () => {
    expect(file).toMatch(/<svg [^>]*viewBox="0 0 128 128"/)
    expect(file).toContain('<title>Developer Sidecar</title>')
    expect(file).not.toMatch(/<script|href=|url\(|<image/)
  })

  it('names every part the workstation animates', () => {
    for (const part of ['sc-car', 'sc-arm', 'sc-speed', 'sc-shadow', 'sc-wheel--rear', 'sc-wheel--front', 'sc-spokes--a', 'sc-spokes--b']) {
      expect(file).toContain(part)
    }
  })

  it('draws the taillight after the body, so the body does not cover it', () => {
    expect(file.indexOf('#F04448')).toBeGreaterThan(file.indexOf('#F5B91D'))
  })

  it('inlines without its title, style or comments', () => {
    expect(MARK_INNER).not.toMatch(/<svg|<\/svg>|<title>|<style>|<!--/)
    expect(MARK_INNER).toContain('class="sc-car"')
    expect(markInner('<svg viewBox="0 0 1 1"><title>t</title><style>x{}</style><rect/></svg>\n')).toBe('<rect/>')
  })
})

describe('shouldPlayIntro', () => {
  const base = { search: '', reducedMotion: false, webdriver: false, seen: false }

  it('plays once per tab', () => {
    expect(shouldPlayIntro(base)).toBe(true)
    expect(shouldPlayIntro({ ...base, seen: true })).toBe(false)
  })

  it('never plays for reduced motion or under automation', () => {
    expect(shouldPlayIntro({ ...base, reducedMotion: true })).toBe(false)
    expect(shouldPlayIntro({ ...base, webdriver: true })).toBe(false)
  })

  it('follows ?intro= over everything else', () => {
    expect(shouldPlayIntro({ ...base, search: '?intro=1', seen: true, webdriver: true, reducedMotion: true })).toBe(true)
    expect(shouldPlayIntro({ ...base, search: '?intro=0' })).toBe(false)
  })
})
