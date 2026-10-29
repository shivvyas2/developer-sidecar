import { lazy, Suspense, useEffect, useMemo, useReducer, useState } from 'react'
import { buildRecap, isExplained, storyOf, townOf, type Attention, type Baseline, type ConceptId, type FeedStep, type ProjectMap, type RecapEntry, type StepExplanation } from '@sidecar/shared'
import { checksOf, HEALTH_LIGHT, HEALTH_WORD, healthOf, type Readout } from '@sidecar/ui-kit'
import { Chip, PulledCard, ReadoutPanel } from './ds'
import { ConceptCard } from './city/ConceptCard'
import { cardFor, conceptAt } from './city/conceptView'
import { GithubGuide } from './city/GithubGuide'
import { readoutFields } from './framed'
import { formatElapsed, stepKind } from './format'
import { nextAsk } from './next'
import { NextStep } from './NextStep'
import { RecapCard } from './RecapCard'
import { cardAsks, isStale, recapAsk } from './recapView'
import { initialSelection, selectedId, selectionReducer } from './selection'
import { Timeline } from './Timeline'

export interface StageTabProps {
  sessionId: string | null
  loaded: boolean
  steps: FeedStep[]
  /** Explanations stored before recaps replaced them, for older sessions. */
  explanations: Record<string, StepExplanation>
  /** This session's AI recaps, by turn. */
  recaps: Record<string, RecapEntry>
  project?: string
  /** Select this step on arrival (from a Decisions link). */
  pickRequest?: string | null
  /** Shown in place of LIVE while following the newest step, e.g. DONE or NEEDS YOU. */
  liveTag?: string
  /** What the session is doing now, for the status light while following the newest step. */
  attention?: Attention
  /** The session's folder, so the town can name parts from paths relative to it. */
  cwd?: string
  /** The project map for all of `steps` (kept for callers; the town builds its own). */
  map?: ProjectMap
  /** The project folder as it stood when the session began. */
  baseline?: Baseline
  theme: 'light' | 'dark'
  reducedMotion: boolean
  /** Open the Glossary at a term. */
  onGlossary?: (term: string) => void
}

type Picked = { building?: string; stepId?: string; concept?: ConceptId }

// three.js is most of the page's weight, so the town loads in its own chunk
const CityStage = lazy(() => import('./city/CityStage').then((m) => ({ default: m.CityStage })))

/** Layout C: the town fills the stage, cards on the right, the story as a timeline along the bottom. */
export function StageTab({ sessionId, loaded, steps, explanations, recaps, project, pickRequest, liveTag, attention, cwd, baseline, theme, reducedMotion, onGlossary }: StageTabProps) {
  const [selection, select] = useReducer(selectionReducer, initialSelection)
  const [replay, setReplay] = useState<number | null>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const ids = useMemo(() => steps.map((s) => s.id), [steps])
  const latestId = ids.length > 0 ? ids[ids.length - 1]! : null

  // a new session or its first snapshot starts live
  useEffect(() => { setReplay(null); select({ type: 'reset' }); setPicked(null) }, [sessionId, loaded])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request should pick
  useEffect(() => { if (pickRequest && ids.includes(pickRequest)) { setReplay(ids.indexOf(pickRequest)); select({ type: 'pick', id: pickRequest, latestId }) } }, [pickRequest])

  const live = replay === null
  const index = live ? steps.length - 1 : Math.min(replay, steps.length - 1)
  const shown = index >= 0 ? steps[index] : undefined
  const pickedStep = selectedId(selection, latestId)
  const card = !selection.follow && pickedStep ? steps.find((s) => s.id === pickedStep) : undefined

  const chapters = useMemo(() => storyOf(steps, attention === 'working'), [steps, attention])
  const recap = useMemo(() => buildRecap(steps, { ...(attention ? { attention } : {}), ...(cwd ? { cwd } : {}) }), [steps, attention, cwd])
  const upTo = useMemo(() => steps.slice(0, index + 1), [steps, index])
  const town = useMemo(() => townOf(upTo, { ...(cwd ? { cwd } : {}), ...(baseline ? { baseline } : {}) }), [upTo, cwd, baseline])

  const files = useMemo(() => upTo.filter((s) => s.category === 'create' && s.status === 'ok').length, [upTo])
  const checks = useMemo(() => checksOf(upTo), [upTo])
  const now = shown ? stepKind(shown) : ''
  const elapsed = shown ? formatElapsed(shown.startedAt - (steps[0]?.startedAt ?? 0)) : '00:00'
  const shownRecap = live ? recap : null
  const ai = recap ? recaps[recap.turnId] : undefined
  const failing = recap?.failingId ? steps.find((s) => s.id === recap.failingId) : undefined
  const newest = recap ? chapters.find((c) => c.id === recap.turnId)?.stepIds.at(-1) : undefined
  const stale = isStale(ai, newest)
  const ask = recapAsk(ai, failing ? nextAsk(failing, explanations[failing.id]) : null, newest)
  const tag = live ? liveTag : undefined
  const health = useMemo(() => healthOf(upTo, live ? attention : undefined), [upTo, live, attention])
  const readout = useMemo<Readout>(() => ({
    step: index + 1, files, checks, status: HEALTH_WORD[health], light: HEALTH_LIGHT[health], now, elapsed, live,
    session: steps.length > 0 ? (index + 1) / steps.length : 0,
    ...(project ? { project } : {}),
    ...(tag ? { tag } : {}),
  }), [index, files, checks, health, now, elapsed, live, steps.length, project, tag])

  const seek = (i: number) => { setReplay(i); select({ type: 'pick', id: ids[i]!, latestId }) }
  const goLive = () => { setReplay(null); select({ type: 'live' }) }
  const concept = picked ? picked.concept ?? conceptAt(picked, town, steps) : null
  const pickedBuilding = picked?.building ? town.buildings.find((b) => b.id === picked.building) : undefined
  const githubHere = pickedBuilding?.kind === 'archive' || (pickedBuilding?.kind === 'service' && pickedBuilding.vendorKind === 'code') || concept === 'github' || concept === 'repository'

  if (steps.length === 0 && !baseline) {
    return (
      <div className="stagetab stagetab--empty">
        <p className="empty">Waiting for Claude to do something. Start a Claude Code session with the plugin enabled.</p>
      </div>
    )
  }

  return (
    <div className="stagetab stagetab--city">
      <section className="stagetab__town" aria-label="Stage">
        <Suspense fallback={<p className="stagetab__placeholder">Drawing the town...</p>}>
        <CityStage key={sessionId ?? 'none'} steps={steps} upTo={index} live={live} town={town} chapters={chapters} theme={theme} reducedMotion={reducedMotion}
          onPick={(t) => { setPicked(t); if (t.stepId) { const i = ids.indexOf(t.stepId); if (i >= 0 && i !== steps.length - 1) seek(i) } }}
          {...(baseline ? { baseline } : {})} {...(cwd ? { cwd } : {})} {...(attention ? { attention } : {})} />
        </Suspense>
        <p className="sr-only" aria-live="polite">{shown?.caption ?? ''}</p>
      </section>
      <aside className="stagetab__side">
        <ReadoutPanel label="Stage readout" fields={readoutFields(readout)} note={`${tag ?? (live ? 'LIVE' : 'REPLAY')} · ${now}`} />
        {concept ? (
          <ConceptCard key={concept + (picked?.building ?? picked?.stepId ?? '')} card={cardFor(concept, town, steps)}
            {...(pickedBuilding ? { name: pickedBuilding.name } : {})}
            onPickStep={(id) => { const i = ids.indexOf(id); if (i >= 0) seek(i) }}
            onConcept={(id) => setPicked({ concept: id })}
            onGlossary={(term) => onGlossary?.(term)}
            onClose={() => setPicked(null)} />
        ) : null}
        {githubHere ? <GithubGuide git={town.git} steps={steps} /> : null}
        {!concept && shownRecap ? <RecapCard recap={shownRecap} ask={ask} stale={stale} {...(ai ? { ai } : {})} /> : null}
        {card ? <StepDetail key={card.id} step={card} num={ids.indexOf(card.id) + 1} explanation={explanations[card.id]} asks={cardAsks(card.id, shownRecap)} /> : null}
      </aside>
      <div className="stagetab__timeline">
        <Timeline steps={steps} chapters={chapters} at={index} live={live} onSeek={seek} onLive={goLive} />
      </div>
    </div>
  )
}

/** `asks` is false when the recap above already shows this step's ask, so it is not on screen twice. */
function StepDetail({ step, num, explanation, asks }: { step: FeedStep; num: number; explanation?: StepExplanation; asks: boolean }) {
  const [open, setOpen] = useState(false)
  const ask = asks ? nextAsk(step, explanation) : null
  return (
    <PulledCard num={num} title={stepKind(step)}>
      <p className="detail__caption">{step.caption}</p>
      {isExplained(explanation) ? (
        <>
          <p className="detail__plain">{explanation.plain}</p>
          <div className="detail__why">
            <span className="ds-kicker">WHY IT MATTERS</span>
            <p>{explanation.why}</p>
          </div>
          {explanation.concept ? (
            <p className="detail__concept"><Chip>{explanation.concept.term}</Chip> {explanation.concept.definition}</p>
          ) : null}
        </>
      ) : explanation ? (
        <p className="detail__note">No explanation: {explanation.unavailable}</p>
      ) : null}
      {ask ? <NextStep ask={ask} /> : null}
      <button className="detail__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'HIDE TECHNICAL' : 'SHOW TECHNICAL'}
      </button>
      {open ? (
        <pre className="detail__tech">
          {step.techLabel}
          {step.output !== undefined ? `\n\n${JSON.stringify(step.output, null, 2)}` : ''}
        </pre>
      ) : null}
    </PulledCard>
  )
}
