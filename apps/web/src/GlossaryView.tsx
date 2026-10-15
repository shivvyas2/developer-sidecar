import type { GlossaryEntry } from '@sidecar/shared'

export function GlossaryView({ entries, explaining }: { entries: GlossaryEntry[]; explaining: boolean }) {
  if (entries.length === 0) {
    return <p className="empty">{explaining
      ? 'Terms Claude uses will be explained here, one line each.'
      : 'The glossary is built from plain-English explanations, which are off. Turn them on in Settings.'}</p>
  }
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
