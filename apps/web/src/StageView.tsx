import { useEffect, useMemo, useReducer, useState } from 'react'
import { buildRecap, isExplained, projectMap, SceneSpecSchema, storyOf, type Attention, type FeedStep, type RecapEntry, type StepExplanation } from '@sidecar/shared'
import { checksOf, HEALTH_LIGHT, HEALTH_WORD, healthOf, nameTown, townFrom, type Readout } from '@sidecar/ui-kit'
import { forStatus } from '@sidecar/ui-kit/catalog'
import { Scene } from '@sidecar/ui-kit/react'
import { Chip, PulledCard, ReadoutPanel, RoundButton, TickRuler } from './ds'
import { readoutFields, useFramed } from './framed'
import { formatElapsed, stepKind } from './format'
import { nextAsk } from './next'
import { NextStep } from './NextStep'
import { RecapCard } from './RecapCard'
import { recapAsk } from './recapView'
import { initialSelection, selectedId, selectionReducer, stepNumber } from './selection'
import { initialStage, replayAdvance, stageReducer, type Replay } from './stage'
import { StoryDrawer } from './StoryDrawer'

const END = Number.MAX_SAFE_INTEGER

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
}

/** Layout B: the step drawer on the left; the framed stage, replay ruler and pulled-out card on the right. */
export function StageTab({ sessionId, loaded, steps, explanations, recaps, project, pickRequest, liveTag, attention, cwd }: StageTabProps) {
  const [stage, dispatch] = useReducer(stageReducer, initialStage)
  const [selection, select] = useReducer(selectionReducer, initialSelection)
  const [replay, setReplay] = useState<Replay | null>(null)
  const ids = useMemo(() => steps.map((s) => s.id), [steps])
  const latestId = ids.length > 0 ? ids[ids.length - 1]! : null

  // A new session or its first snapshot: show the latest step as a still and don't replay history.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ids are read on purpose but must not retrigger a reset
  useEffect(() => { dispatch({ type: 'reset', ids }); setReplay(null); select({ type: 'reset' }) }, [sessionId, loaded])
  useEffect(() => { dispatch({ type: 'sync', ids }) }, [ids])
  // When Claude stops or needs you, the stage shows where things ended, not a scene still in line.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new tag should catch up
  useEffect(() => { if (liveTag === 'DONE' || liveTag === 'NEEDS YOU') dispatch({ type: 'catchUp', ids }) }, [liveTag])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request should pick
  useEffect(() => { if (pickRequest && ids.includes(pickRequest)) select({ type: 'pick', id: pickRequest, latestId }) }, [pickRequest])

  const picked = selectedId(selection, latestId)
  const pickedIndex = picked ? ids.indexOf(picked) : -1
  const liveIndex = stage.current ? ids.indexOf(stage.current) : -1
  // Replay drives the stage; otherwise an older pick does; otherwise the live queue.
  const index = replay
    ? Math.min(replay.index, steps.length - 1)
    : !selection.follow && pickedIndex >= 0 ? pickedIndex : liveIndex
  const shown = index >= 0 ? steps[index] : undefined
  const cardIndex = replay ? index : pickedIndex
  const card = cardIndex >= 0 ? steps[cardIndex] : undefined

  const chapters = useMemo(() => storyOf(steps, attention === 'working'), [steps, attention])
  const recap = useMemo(() => buildRecap(steps, { ...(attention ? { attention } : {}), ...(cwd ? { cwd } : {}) }), [steps, attention, cwd])

  const upTo = useMemo(() => steps.slice(0, index + 1), [steps, index])
  const town = useMemo(() => nameTown(townFrom(upTo), projectMap(upTo, cwd)), [upTo, cwd])
  const files = useMemo(() => upTo.filter((s) => s.category === 'create' && s.status === 'ok').length, [upTo])
  const checks = useMemo(() => checksOf(upTo), [upTo])
  const now = shown ? stepKind(shown) : ''
  const firstAt = steps[0]?.startedAt ?? 0
  const elapsed = shown ? formatElapsed(shown.startedAt - firstAt) : '00:00'
  // LIVE only while following the newest step; a replay or an older pick reads REPLAY.
  const live = !replay && selection.follow
  const ai = recap?.turnId ? recaps[recap.turnId] : undefined
  const failing = recap?.failingId ? steps.find((s) => s.id === recap.failingId) : undefined
  const ask = recapAsk(ai, failing ? nextAsk(failing, explanations[failing.id]) : null)
  const framed = useFramed()
  const count = steps.length
  // Built from primitives so the SVG only re-renders when a number on the frame changes.
  const tag = live ? liveTag : undefined
  // Only the live moment knows what Claude is doing now; a replay or an older pick shows how things stood then.
  const health = useMemo(() => healthOf(upTo, live ? attention : undefined), [upTo, live, attention])
  const readout = useMemo<Readout>(() => ({
    step: index + 1, files, checks, status: HEALTH_WORD[health], light: HEALTH_LIGHT[health], now, elapsed, live,
    session: count > 0 ? (index + 1) / count : 0,
    ...(project ? { project } : {}),
    ...(tag ? { tag } : {}),
  }), [index, files, checks, health, now, elapsed, live, count, project, tag])

  const goLive = () => { dispatch({ type: 'reset', ids }); setReplay(null); select({ type: 'live' }) }
  const pick = (id: string) => {
    select({ type: 'pick', id, latestId })
    if (replay) setReplay({ index: ids.indexOf(id), playing: false })
  }
  const play = () => {
    if (replay) setReplay({ ...replay, playing: true })
    else setReplay({ index: !selection.follow && pickedIndex >= 0 ? pickedIndex : 0, playing: true })
  }
  const pause = () => {
    if (replay) setReplay({ ...replay, playing: false })
    else if (shown) setReplay({ index, playing: false })
  }

  if (steps.length === 0) {
    return (
      <div className="stagetab stagetab--empty">
        <p className="empty">Waiting for Claude to do something. Start a Claude Code session with the plugin enabled.</p>
      </div>
    )
  }

  const parsed = shown ? SceneSpecSchema.safeParse(forStatus(shown.scene, shown.status)) : undefined
  const onDone = replay
    ? () => setReplay((r) => (r ? replayAdvance(r, steps.length) : r))
    : selection.follow ? () => dispatch({ type: 'done' }) : undefined
  const still = replay ? !replay.playing : selection.follow ? !stage.playing : false
  const mode = replay ? 'replay' : selection.follow ? 'live' : 'pick'

  return (
    <div className="stagetab">
      <div className="stagetab__drawer">
        <StoryDrawer steps={steps} chapters={chapters} selectedId={cardIndex >= 0 ? steps[cardIndex]!.id : null} following={live} onPick={pick} />
      </div>
      <div className="stagetab__main">
        {/* how the last thing you asked stands, first on screen while following live */}
        {live && recap ? <RecapCard recap={recap} ask={ask} {...(ai ? { ai } : {})} /> : null}
        {!framed && shown ? (
          <ReadoutPanel label="Stage readout" fields={readoutFields(readout)} note={`${tag ?? (live ? 'LIVE' : 'REPLAY')} · ${now}`} />
        ) : null}
        <section className="stagetab__stage" aria-label="Stage">
          {shown && parsed?.success ? (
            <Scene
              key={`${mode}:${shown.id}`}
              spec={parsed.data}
              town={town}
              frame={framed}
              {...(framed ? { readout } : {})}
              {...(onDone ? { onDone } : {})}
              {...(still ? { at: END } : {})}
            />
          ) : (
            <p className="stagetab__placeholder">The stage lights up when Claude starts working.</p>
          )}
          <p className="sr-only" aria-live="polite">{shown?.caption ?? ''}</p>
        </section>
        <div className="replay">
          <TickRuler
            value={Math.max(0, index)}
            max={Math.max(0, steps.length - 1)}
            valueText={`Step ${index + 1} of ${steps.length}`}
            onChange={(v) => setReplay({ index: v, playing: false })}
          />
          <span className="replay__pos">{stepNumber(Math.max(0, index))}/{stepNumber(steps.length - 1)}</span>
          <RoundButton label="▶" title={replay ? 'Play' : 'Replay session'} active={!!replay?.playing} onPress={play} />
          <RoundButton label="⏸" title="Pause" onPress={pause} disabled={!!replay && !replay.playing} />
          <RoundButton label="LIVE" title="Back to live" active={live} onPress={goLive} />
        </div>
        {card ? (
          <StepDetail
            key={card.id}
            step={card}
            num={cardIndex + 1}
            explanation={explanations[card.id]}
          />
        ) : null}
      </div>
    </div>
  )
}

function StepDetail({ step, num, explanation }: { step: FeedStep; num: number; explanation?: StepExplanation }) {
  const [open, setOpen] = useState(false)
  const ask = nextAsk(step, explanation)
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
