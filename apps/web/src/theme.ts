/** Theme preference: auto follows the OS; light or dark forces one via <html data-theme>. */
export type ThemePref = 'auto' | 'light' | 'dark'

const KEY = 'sidecar-theme'

export function readTheme(storage: Pick<Storage, 'getItem'> | null): ThemePref {
  try {
    const v = storage?.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function writeTheme(storage: Pick<Storage, 'setItem'> | null, pref: ThemePref): void {
  try {
    storage?.setItem(KEY, pref)
  } catch {
    /* private mode or quota: the choice just does not persist */
  }
}

export function applyTheme(root: { dataset: DOMStringMap }, pref: ThemePref): void {
  if (pref === 'auto') delete root.dataset.theme
  else root.dataset.theme = pref
}

export const nextTheme = (p: ThemePref): ThemePref => (p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto')
