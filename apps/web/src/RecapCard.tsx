import type { RecapEntry, RuleRecap } from '@sidecar/shared'
import { NextStep } from './NextStep'
import { recapText } from './recapView'

/**
 * "Where things stand" after the last thing you asked, or "so far" while Claude works: the facts
 * from the steps, and, once the turn ends, the AI recap of it when there is one. A `stale` recap was
 * written before Claude went on with the turn, so it reads as how things stood SO FAR.
 */
export function RecapCard({ recap, ai, ask, stale = false }: { recap: RuleRecap; ai?: RecapEntry; ask: string | null; stale?: boolean }) {
  const t = recapText(recap)
  return (
    <section className="recap" data-outcome={recap.outcome} data-state={recap.state} aria-label="Where things stand">
      <div className="recap__top">
        <span className="ds-kicker">{t.kicker}</span>
        <span className="recap__checks" data-checks={recap.checks}>{t.checks}</span>
      </div>
      {recap.asked ? <p className="recap__asked">You asked: {recap.asked}</p> : null}
      <p className="recap__headline">{t.headline}</p>
      {ai?.status === 'done' && ai.ai ? (
        <div className="recap__ai" data-stale={stale || undefined}>
          {stale ? <span className="ds-kicker">SO FAR</span> : null}
          <p className="recap__summary">{ai.ai.summary}</p>
          <span className="ds-kicker">WHAT IT MEANS</span>
          <p className="recap__meaning">{ai.ai.meaning}</p>
        </div>
      ) : ai?.status === 'pending' ? (
        <p className="recap__note recap__note--pending">Summarizing…</p>
      ) : ai?.status === 'unavailable' ? (
        <p className="recap__note">No AI recap: {ai.reason ?? 'it could not be written.'}</p>
      ) : null}
      {t.parts.length ? (
        <ul className="recap__parts" aria-label="Made or changed">
          {t.parts.map((p) => <li key={p.id} data-failed={p.failed || undefined}>{p.name}</li>)}
          {t.more ? <li className="recap__more">and {t.more} more</li> : null}
        </ul>
      ) : null}
      {t.packages ? <p className="recap__note">{t.packages}</p> : null}
      {recap.url ? (
        <a className="recap__open" href={recap.url} target="_blank" rel="noopener noreferrer">OPEN YOUR APP <span className="recap__url">{t.address}</span></a>
      ) : null}
      {ask ? <NextStep ask={ask} /> : null}
    </section>
  )
}
