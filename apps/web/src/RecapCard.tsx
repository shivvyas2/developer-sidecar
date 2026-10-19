import type { RuleRecap } from '@sidecar/shared'
import { NextStep } from './NextStep'
import { recapText } from './recapView'

/** "Where things stand" after the last thing you asked, or "so far" while Claude works. */
export function RecapCard({ recap, ask }: { recap: RuleRecap; ask: string | null }) {
  const t = recapText(recap)
  return (
    <section className="recap" data-outcome={recap.outcome} data-state={recap.state} aria-label="Where things stand">
      <div className="recap__top">
        <span className="ds-kicker">{t.kicker}</span>
        <span className="recap__checks" data-checks={recap.checks}>{t.checks}</span>
      </div>
      {recap.asked ? <p className="recap__asked">You asked: {recap.asked}</p> : null}
      <p className="recap__headline">{t.headline}</p>
      {t.parts.length ? (
        <ul className="recap__parts" aria-label="Made or changed">
          {t.parts.map((p) => <li key={p.name} data-failed={p.failed || undefined}>{p.name}</li>)}
          {t.more ? <li className="recap__more">and {t.more} more</li> : null}
        </ul>
      ) : null}
      {t.packages ? <p className="recap__note">{t.packages}</p> : null}
      {recap.url ? (
        <a className="recap__open" href={recap.url} target="_blank" rel="noopener noreferrer">OPEN YOUR APP <span className="recap__url">{recap.url.replace(/^http:\/\//, '')}</span></a>
      ) : null}
      {ask ? <NextStep ask={ask} /> : null}
    </section>
  )
}
