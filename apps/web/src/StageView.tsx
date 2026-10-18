import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { isExplained, SceneSpecSchema, type ExplainerState, type FeedStep, type StepExplanation } from '@sidecar/shared'
import { townFrom, type Readout } from '@sidecar/ui-kit'
import { forStatus } from '@sidecar/ui-kit/catalog'
import { Scene } from '@sidecar/ui-kit/react'
import { Chip, PulledCard, ReadoutPanel, RoundButton, StepCard, StepDrawer, TickRuler } from './ds'
import { readoutFields, useFramed } from './framed'
import { formatElapsed, stepTitle } from './format'
import { nextAsk, UNDO_HINT } from './next'
import { isPendingExplanation } from './pending'
import { initialSelection, selectedId, selectionReducer, stepNumber } from './selection'
import { initialStage, replayAdvance, stageReducer, type Replay } from './stage'

const END = Number.MAX_SAFE_INTEGER

export interface StageTabProps {
  sessionId: string | null
  loaded: boolean
  steps: FeedStep[]
  explanations: Record<string, StepExplanation>
  explainer: ExplainerState | null
  readySince: number
  project?: string
  /** Select this step on arrival (from a Decisions link). */
  pickRequest?: string | null
  /** Shown in place of LIVE while following the newest step, e.g. DONE or NEEDS YOU. */
  liveTag?: string
}

/** Layout B: the step drawer on the left; the framed stage, replay ruler and pulled-out card on the right. */
export function StageTab({ sessionId, loaded, steps, explanations, explainer, readySince, project, pickRequest, liveTag }: StageTabProps) {
  const [stage, dispatch] = useReducer(stageReducer, initialStage)
  const [selection, select] = useReducer(selectionReducer, initialSelection)
  const [replay, setReplay] = useState<Replay | null>(null)
  const ids = useMemo(() => steps.map((s) => s.id), [steps])
  const latestId = ids.length > 0 ? ids[ids.length - 1]! : null

  // A new session or its first snapshot: show the latest step as a still and don't replay history.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ids are read on purpose but must not retrigger a reset
  useEffect(() => { dispatch({ type: 'reset', ids }); setReplay(null); select({ type: 'reset' }) }, [sessionId, loaded])
  useEffect(() => { dispatch({ type: 'sync', ids }) }, [ids])
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

  const town = useMemo(() => townFrom(steps.slice(0, index + 1)), [steps, index])

  const tokens = explainer ? explainer.tokens.input + explainer.tokens.output : 0
  const files = useMemo(
    () => steps.slice(0, index + 1).filter((s) => s.category === 'create' && s.status === 'ok').length,
    [steps, index],
  )
  const now = shown ? stepTitle(shown) : ''
  const firstAt = steps[0]?.startedAt ?? 0
  const elapsed = shown ? formatElapsed(shown.startedAt - firstAt) : '00:00'
  // LIVE only while following the newest step; a replay or an older pick reads REPLAY.
  const live = !replay && selection.follow
  const framed = useFramed()
  const count = steps.length
  // Built from primitives so the SVG only re-renders when a number on the frame changes.
  const tag = live ? liveTag : undefined
  const readout = useMemo<Readout>(() => ({
    step: index + 1, files, tokens, now, elapsed, live,
    session: count > 0 ? (index + 1) / count : 0,
    ...(project ? { project } : {}),
    ...(tag ? { tag } : {}),
  }), [index, files, tokens, now, elapsed, live, count, project, tag])

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
        <StepDrawer count={steps.length}>
          {[...steps].reverse().map((s, r) => {
            const i = steps.length - 1 - r
            return (
              <StepCard
                key={s.id}
                num={i + 1}
                title={stepTitle(s)}
                caption={s.caption}
                status={s.status}
                selected={i === cardIndex}
                onSelect={() => pick(s.id)}
              />
            )
          })}
        </StepDrawer>
      </div>
      <div className="stagetab__main">
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
            pending={isPendingExplanation(card, explanations[card.id], explainer, readySince)}
          />
        ) : null}
      </div>
    </div>
  )
}

function StepDetail({ step, num, explanation, pending }: { step: FeedStep; num: number; explanation?: StepExplanation; pending: boolean }) {
  const [open, setOpen] = useState(false)
  const ask = nextAsk(step, explanation)
  return (
    <PulledCard num={num} title={stepTitle(step)}>
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
      ) : pending ? (
        <p className="detail__note detail__note--pending">Explaining…</p>
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

/** A failed step's way forward: a request to copy into Claude Code, and Claude Code's own undo. */
function NextStep({ ask }: { ask: string }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'select'>('idle')
  const text = useRef<HTMLElement>(null)
  const copy = () => {
    const selectIt = () => {
      const range = document.createRange()
      if (text.current) range.selectNodeContents(text.current)
      getSelection()?.removeAllRanges()
      getSelection()?.addRange(range)
      setCopied('select')
    }
    if (!navigator.clipboard) return selectIt()
    navigator.clipboard.writeText(ask).then(() => setCopied('copied'), selectIt)
  }
  return (
    <div className="detail__next">
      <span className="ds-kicker">WHAT TO DO NEXT</span>
      <div className="detail__ask">
        <code ref={text}>{ask}</code>
        <button type="button" className="detail__copy" onClick={copy}>
          {copied === 'copied' ? 'COPIED' : copied === 'select' ? 'SELECTED, PRESS COPY' : 'COPY FOR CLAUDE'}
        </button>
      </div>
      <p className="detail__undo">{UNDO_HINT}</p>
    </div>
  )
}
