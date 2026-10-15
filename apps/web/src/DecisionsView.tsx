import type { DecisionEntry, ExplainerState } from '@sidecar/shared'
import { SpecCard } from './ds'

const EMPTY: Record<ExplainerState['status'], string> = {
  ready: 'No architecture decisions yet. When Claude picks a library, service, database or approach, it shows up here with the reasons.',
  off: 'Architecture decisions are collected from plain-English explanations, which are off. Turn them on in Settings.',
  paused: 'Architecture decisions are collected from plain-English explanations, which are paused. See the banner or Settings.',
  unavailable: 'Architecture decisions are collected from plain-English explanations, which need an Anthropic API key or the claude command.',
}

/** `stepIds` is the session's step ids in order, so a decision's step number is its index + 1. */
export function DecisionsView({ decisions, status, stepIds, onPick }: {
  decisions: DecisionEntry[]
  status: ExplainerState['status'] | null
  stepIds: string[]
  onPick: (stepId: string) => void
}) {
  if (decisions.length === 0) return <p className="empty">{EMPTY[status ?? 'ready']}</p>
  const ordered = [...decisions].sort((a, b) => a.at - b.at)
  return (
    <div className="decisions">
      {ordered.map((d, i) => {
        const index = stepIds.indexOf(d.stepId)
        return (
          <SpecCard
            key={d.id}
            num={i + 1}
            title={d.title}
            chose={d.choice}
            alternatives={d.alternatives}
            reason={d.reason}
            {...(index >= 0 ? { step: index + 1 } : {})}
            onStep={() => onPick(d.stepId)}
          />
        )
      })}
    </div>
  )
}
