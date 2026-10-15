import { useEffect, useState } from 'react'
import { fmtTokens, type Readout } from '@sidecar/ui-kit'
import type { ReadoutField } from './ds/ReadoutPanel'

/** At this width and below the workstation is one column (styles.css) and the SVG frame text is too small to read. */
export const FRAMED_MIN = 860
const QUERY = `(min-width: ${FRAMED_MIN + 1}px)`

/** Whether the stage draws its SVG frame at this viewport width. An unknown width keeps the frame. */
export const framedAt = (width: number | undefined): boolean =>
  width === undefined || !Number.isFinite(width) ? true : width > FRAMED_MIN

const media = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null

/** framedAt for the live viewport, following resizes. Without matchMedia (SSR, tests) it keeps the frame. */
export function useFramed(): boolean {
  const [framed, setFramed] = useState(() => media()?.matches ?? true)
  useEffect(() => {
    const m = media()
    if (!m) return
    const on = () => setFramed(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return framed
}

const pad = (v: number, width: number) => String(Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0).padStart(width, '0')

/** The frame's numbers for the DOM ReadoutPanel, formatted as the SVG readout formats them. */
export const readoutFields = (r: Readout): ReadoutField[] => [
  { label: 'STEP', value: pad(r.step, 3) },
  { label: 'FILES', value: pad(r.files, 2) },
  { label: 'TOKENS', value: fmtTokens(r.tokens) },
  { label: 'ELAPSED', value: r.elapsed.trim() || '00:00' },
]
