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

/**
 * A DOM id for a glossary term: lowercase, runs of anything but a-z0-9 become one
 * dash, plus the term's index so "API" and "api" never share an id.
 */
export const termSlug = (term: string, index: number): string => {
  const slug = term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'term'}-${index}`
}
