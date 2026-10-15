import type { DecisionEntry, ExplainerState } from '@sidecar/shared'

const EMPTY: Record<ExplainerState['status'], string> = {
  ready: 'No architecture decisions yet. When Claude picks a library, service, database or approach, it shows up here with the reasons.',
  off: 'Architecture decisions are collected from plain-English explanations, which are off. Turn them on in Settings.',
  paused: 'Architecture decisions are collected from plain-English explanations, which are paused. See the banner or Settings.',
  unavailable: 'Architecture decisions are collected from plain-English explanations, which need an Anthropic API key or the claude command.',
}

export function DecisionsView({ decisions, status }: { decisions: DecisionEntry[]; status: ExplainerState['status'] | null }) {
  if (decisions.length === 0) return <p className="empty">{EMPTY[status ?? 'ready']}</p>
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
