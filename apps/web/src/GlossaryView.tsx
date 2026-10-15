import type { ExplainerState, GlossaryEntry } from '@sidecar/shared'

const EMPTY: Record<ExplainerState['status'], string> = {
  ready: 'Terms Claude uses will be explained here, one line each.',
  off: 'The glossary is built from plain-English explanations, which are off. Turn them on in Settings.',
  paused: 'The glossary is built from plain-English explanations, which are paused. See the banner or Settings.',
  unavailable: 'The glossary is built from plain-English explanations, which need an Anthropic API key or the claude command.',
}

export function GlossaryView({ entries, status }: { entries: GlossaryEntry[]; status: ExplainerState['status'] | null }) {
  if (entries.length === 0) return <p className="empty">{EMPTY[status ?? 'ready']}</p>
  return (
    <dl className="glossary">
      {entries.map((e) => (
        <div key={e.term.toLowerCase()} className="glossary__item">
          <dt>{e.term}</dt>
          <dd>{e.definition}</dd>
        </div>
      ))}
    </dl>
  )
}
