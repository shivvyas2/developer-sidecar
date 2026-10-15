import { palette } from '@sidecar/ui-kit'

type Mode = 'light' | 'dark'
const ON: Record<Mode, string> = {
  light: '--ds-on-accent: var(--sk-ink); --ds-on-label: var(--sk-ink);',
  dark: '--ds-on-accent: var(--sk-paper); --ds-on-label: var(--sk-paper);',
}
const FACES: Record<Mode, [string, string]> = { light: ['.88', '.95'], dark: ['.75', '.88'] }

/**
 * The gallery's light and dark halves each carry their own variables, so a half keeps
 * its theme whatever the page or the OS says: themeCss() only targets :root. Built from
 * the palette, never hard-coded. Face filters use `.kit .kit__half[...]` (0,4,0) so they
 * beat the OS dark rule `:root:not([data-theme="light"]) .sk-face-l` (0,3,0).
 */
export const kitScopeCss = (): string =>
  (['light', 'dark'] as const).map((m) => {
    const vars = Object.entries(palette[m]).map(([k, v]) => `--sk-${k}: ${v};`).join(' ')
    const [l, r] = FACES[m]
    const scope = `.kit .kit__half[data-theme="${m}"]`
    return `.kit [data-theme="${m}"] { ${vars} ${ON[m]} color-scheme: ${m}; } `
      + `${scope} .sk-face-l{filter:brightness(${l})} ${scope} .sk-face-r{filter:brightness(${r})}`
  }).join(' ')
