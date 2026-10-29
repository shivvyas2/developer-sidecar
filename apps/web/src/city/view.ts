import { useEffect, useState } from 'react'
import type { ThemePref } from '../theme'

const media = (q: string) => (typeof matchMedia === 'function' ? matchMedia(q) : null)

/** light or dark as the page shows it: a forced theme, or the OS one under auto. */
export function useResolvedTheme(pref: ThemePref): 'light' | 'dark' {
  const [osDark, setOsDark] = useState(() => !!media('(prefers-color-scheme: dark)')?.matches)
  useEffect(() => {
    const m = media('(prefers-color-scheme: dark)')
    if (!m) return
    const on = () => setOsDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return pref === 'auto' ? (osDark ? 'dark' : 'light') : pref
}

/** The OS asks for less motion. */
export function useOsReducedMotion(): boolean {
  const [on, setOn] = useState(() => !!media('(prefers-reduced-motion: reduce)')?.matches)
  useEffect(() => {
    const m = media('(prefers-reduced-motion: reduce)')
    if (!m) return
    const f = () => setOn(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return on
}
