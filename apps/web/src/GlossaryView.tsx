import { useMemo, useState } from 'react'
import type { ExplainerState, GlossaryEntry } from '@sidecar/shared'
import { groupCatalog, termSlug } from './catalog'
import { CardCatalog } from './ds'

const EMPTY: Record<ExplainerState['status'], string> = {
  ready: 'Terms Claude uses will be explained here, one line each.',
  off: 'The glossary is built from AI recaps, which are off. Turn them on in Settings.',
  paused: 'The glossary is built from AI recaps, which are paused. See the banner or Settings.',
  unavailable: 'The glossary is built from AI recaps, which need an Anthropic API key or the claude command.',
}

export function GlossaryView({ entries, status, project }: { entries: GlossaryEntry[]; status: ExplainerState['status'] | null; project?: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const groups = useMemo(() => {
    let i = 0
    return groupCatalog(entries).map((g) => ({
      letter: g.letter,
      terms: g.entries.map((e) => ({ id: termSlug(e.term, i++), term: e.term, body: e.definition })),
    }))
  }, [entries])
  if (entries.length === 0) return <p className="empty">{EMPTY[status ?? 'ready']}</p>
  return <CardCatalog groups={groups} open={open} onOpen={setOpen} label={project ? `${project}'s terms` : 'Terms'} />
}
