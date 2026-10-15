import type { DecisionEntry } from '@sidecar/shared'

export function DecisionsView({ decisions, explaining }: { decisions: DecisionEntry[]; explaining: boolean }) {
  if (decisions.length === 0) {
    return <p className="empty">{explaining
      ? 'No architecture decisions yet. When Claude picks a library, service, database or approach, it shows up here with the reasons.'
      : 'Architecture decisions are collected from plain-English explanations, which are off. Turn them on in Settings.'}</p>
  }
  return (
    <ol className="decisions">
      {decisions.map((d) => (
        <li key={d.id} className="decision">
          <h3 className="decision__title">{d.title}</h3>
          <p className="decision__choice"><strong>Chose:</strong> {d.choice}</p>
          {d.alternatives.length > 0 && <p className="decision__alts"><strong>Instead of:</strong> {d.alternatives.join(', ')}</p>}
          <p className="decision__reason">{d.reason}</p>
          <time className="decision__at" dateTime={new Date(d.at).toISOString()}>{new Date(d.at).toLocaleTimeString()}</time>
        </li>
      ))}
    </ol>
  )
}
