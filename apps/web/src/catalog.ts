import type { GlossaryEntry } from '@sidecar/shared'

export interface CatalogGroup { letter: string; count: string; entries: GlossaryEntry[] }

/** Glossary entries grouped by first letter (A-Z, then # for anything else), sorted case-insensitively. */
export function groupCatalog(entries: GlossaryEntry[]): CatalogGroup[] {
  const by = new Map<string, GlossaryEntry[]>()
  for (const e of entries) {
    const first = e.term.trim().charAt(0).toUpperCase()
    const letter = /[A-Z]/.test(first) ? first : '#'
    by.set(letter, [...(by.get(letter) ?? []), e])
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
    .map(([letter, list]) => ({
      letter,
      count: String(list.length).padStart(3, '0'),
      entries: [...list].sort((x, y) => x.term.localeCompare(y.term, undefined, { sensitivity: 'base' })),
    }))
}
