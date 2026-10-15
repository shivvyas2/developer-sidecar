import type { ActionId } from '@sidecar/shared'

export const palette = {
  light: {
    paper: '#EDECE8', card: '#FFFFFF', ink: '#111111', ink2: '#777777', grid: '#DCDAD4',
    accent: '#FF4A1C', label: '#F4E7A1',
    blockApp: '#F4E7A1', blockService: '#A9D4E0', blockData: '#D9D0BF', blockAuth: '#EBA3AE', blockOk: '#C7D9A5',
  },
  dark: {
    paper: '#141414', card: '#1C1C1C', ink: '#E8E6E0', ink2: '#8A8A8A', grid: '#222222',
    accent: '#FF4A1C', label: '#8E8352',
    blockApp: '#8E8352', blockService: '#4F7F8C', blockData: '#6E6658', blockAuth: '#8C5560', blockOk: '#5E7346',
  },
} as const

export type ColorToken = keyof typeof palette.light
export const color = (k: ColorToken): string => `var(--sk-${k}, ${palette.light[k]})`

const vars = (mode: 'light' | 'dark') =>
  Object.entries(palette[mode]).map(([k, v]) => `--sk-${k}: ${v};`).join(' ')

/** Block sides: 88% / 95% brightness in light, deeper (75% / 88%) in dark. */
const faces = (scope: string) =>
  `${scope} .sk-face-l{filter:brightness(.75)} ${scope} .sk-face-r{filter:brightness(.88)}`

/** Auto follows the OS; <html data-theme="light|dark"> forces one. */
export const themeCss = (): string =>
  `:root { ${vars('light')} } `
  + `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${vars('dark')} } } `
  + `:root[data-theme="dark"] { ${vars('dark')} } `
  + `.sk-face-l{filter:brightness(.88)} .sk-face-r{filter:brightness(.95)} `
  + `@media (prefers-color-scheme: dark) { ${faces(':root:not([data-theme="light"])')} } `
  + faces(':root[data-theme="dark"]')

export const FONTS = {
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  dot: "'DotGothic16', 'JetBrains Mono', ui-monospace, monospace",
  sans: "'Inter Variable', Inter, system-ui, -apple-system, sans-serif",
} as const

export const STROKE = 3

export const BEAT_MS: Record<ActionId, number> = {
  walkTo: 900, plugCable: 1200, hammer: 1200, inspect: 1200, hand: 1000, think: 1400,
  celebrate: 900, read: 1200, unpack: 1200, ship: 1300, launch: 1600, speak: 1200,
}
export const FX_MS = 700
export const HOLD_MS = 900
