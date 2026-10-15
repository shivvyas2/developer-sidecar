import { FONTS } from '../tokens'
import { label, n } from '../svg'

/** Trim to at most `max` visible characters, ending in an ellipsis when cut. Then escape via label(). */
export const fit = (s: string, max: number): string => {
  const t = s.trim()
  const m = Math.max(1, Math.floor(max))
  return label(t.length > m ? `${t.slice(0, m - 1)}…` : t)
}

export const mono = (
  x: number, y: number, size: number, fill: string, text: string,
  o: { weight?: number; anchor?: 'start' | 'middle' | 'end'; spacing?: number } = {},
): string =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${FONTS.mono}" font-size="${size}" font-weight="${o.weight ?? 400}"`
  + `${o.anchor && o.anchor !== 'start' ? ` text-anchor="${o.anchor}"` : ''}`
  + `${o.spacing ? ` letter-spacing="${o.spacing}"` : ''} fill="${fill}">${text}</text>`
