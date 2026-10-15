import { describe, expect, test } from 'vitest'
import { palette } from '@sidecar/ui-kit'
import { kitScopeCss } from '../src/kitTheme'

const block = (css: string, theme: 'light' | 'dark') => css.match(new RegExp(`\\.kit \\[data-theme="${theme}"\\] \\{([^}]*)\\}`))?.[1] ?? ''

describe('kitScopeCss', () => {
  const css = kitScopeCss()
  test.each(['light', 'dark'] as const)('the %s wrapper sets every palette variable itself', (theme) => {
    const b = block(css, theme)
    for (const [k, v] of Object.entries(palette[theme])) expect(b, k).toContain(`--sk-${k}: ${v};`)
    expect(b).toContain(`color-scheme: ${theme};`)
  })
  test('on-colours follow the wrapper, not the OS', () => {
    expect(block(css, 'light')).toContain('--ds-on-accent: var(--sk-ink); --ds-on-label: var(--sk-ink);')
    expect(block(css, 'dark')).toContain('--ds-on-accent: var(--sk-paper); --ds-on-label: var(--sk-paper);')
  })
  test('block faces are scoped tightly enough to beat the OS dark rule (:root:not(...) .sk-face-l)', () => {
    expect(css).toContain('.kit .kit__half[data-theme="light"] .sk-face-l{filter:brightness(.88)}')
    expect(css).toContain('.kit .kit__half[data-theme="dark"] .sk-face-l{filter:brightness(.75)}')
  })
})
