import type { ActionId } from '@sidecar/shared'

export const palette = {
  light: {
    ink: '#1d1b16', paper: '#fffdf8', sky: '#e6f0fb', ground: '#efe8d8', wall: '#ffffff',
    roof: '#5b5bd6', claude: '#d97757', helper: '#5b5bd6', you: '#2f8f5b',
    accent: '#f2b84b', ok: '#2f8f5b', fail: '#c4442f', smoke: '#8a857a',
  },
  dark: {
    ink: '#f1eee6', paper: '#2b2920', sky: '#18202c', ground: '#24221b', wall: '#34312a',
    roof: '#7c7cf0', claude: '#e08a6c', helper: '#8b8bf0', you: '#5cc08a',
    accent: '#f2c46b', ok: '#5cc08a', fail: '#e06a55', smoke: '#a39e92',
  },
} as const

export type ColorToken = keyof typeof palette.light

export const color = (k: ColorToken): string => `var(--sk-${k}, ${palette.light[k]})`

const vars = (mode: 'light' | 'dark') =>
  Object.entries(palette[mode]).map(([k, v]) => `--sk-${k}: ${v};`).join(' ')

/** Stylesheet text that sets every --sk-* variable, following the OS theme. */
export const themeCss = (): string =>
  `:root { ${vars('light')} } @media (prefers-color-scheme: dark) { :root { ${vars('dark')} } }`

export const STROKE = 3

export const BEAT_MS: Record<ActionId, number> = {
  walkTo: 900, plugCable: 1200, hammer: 1200, inspect: 1200, hand: 1000, think: 1400,
  celebrate: 900, read: 1200, unpack: 1200, ship: 1300, launch: 1600, speak: 1200,
}
export const FX_MS = 700
export const HOLD_MS = 900
