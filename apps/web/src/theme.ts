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

/** A `?theme=` override for screenshots and links; null when absent or not a known preference. */
export function themeFromQuery(search: string): ThemePref | null {
  const v = new URLSearchParams(search).get('theme')
  return v === 'auto' || v === 'light' || v === 'dark' ? v : null
}

/** The theme at startup: a `?theme=` override when present, else the stored preference. */
export const initialTheme = (search: string, storage: Pick<Storage, 'getItem'> | null): ThemePref =>
  themeFromQuery(search) ?? readTheme(storage)

/** localStorage, or null where touching it throws (sandboxed frames, blocked storage). */
export function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
