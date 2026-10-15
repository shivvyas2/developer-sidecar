import { useEffect, useMemo, useReducer, useState } from 'react'
import type { FeedStep } from '@sidecar/shared'
import { townFrom } from '@sidecar/ui-kit'
import { Scene } from '@sidecar/ui-kit/react'
import { initialStage, replayAdvance, stageReducer, type Replay } from './stage'

const END = Number.MAX_SAFE_INTEGER

export function Stage({ sessionId, loaded, steps }: { sessionId: string | null; loaded: boolean; steps: FeedStep[] }) {
  const [stage, dispatch] = useReducer(stageReducer, initialStage)
  const [replay, setReplay] = useState<Replay | null>(null)
  const ids = useMemo(() => steps.map((s) => s.id), [steps])

  // A new session or its first snapshot: show the latest step as a still and don't replay history.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ids are read on purpose but must not retrigger a reset
  useEffect(() => { dispatch({ type: 'reset', ids }); setReplay(null) }, [sessionId, loaded])
  useEffect(() => { dispatch({ type: 'sync', ids }) }, [ids])

  const index = replay ? Math.min(replay.index, steps.length - 1) : stage.current ? ids.indexOf(stage.current) : -1
  const shown = index >= 0 ? steps[index] : undefined
  const town = useMemo(() => townFrom(steps.slice(0, index + 1)), [steps, index])

  if (!shown) {
    return <section className="stage stage--empty"><p>The stage lights up when Claude starts working.</p></section>
  }

  const onDone = replay
    ? () => setReplay((r) => (r ? replayAdvance(r, steps.length) : r))
    : () => dispatch({ type: 'done' })

  return (
    <section className="stage" aria-label="Stage">
      <Scene
        key={`${replay ? 'replay' : 'live'}:${shown.id}`}
        spec={shown.scene}
        town={town}
        onDone={onDone}
        {...(replay && !replay.playing ? { at: END } : {})}
      />
      <p className={`stage__caption stage__caption--${shown.status}`} aria-live="polite">{shown.caption}</p>
      <div className="scrubber">
        {replay ? (
          <>
            <button onClick={() => setReplay({ ...replay, playing: !replay.playing })}>{replay.playing ? '⏸ Pause' : '▶ Play'}</button>
            <input
              type="range" min={0} max={Math.max(0, steps.length - 1)} value={index} aria-label="Replay position"
              onChange={(e) => setReplay({ index: Number(e.target.value), playing: false })}
            />
            <span className="scrubber__pos">{index + 1} / {steps.length}</span>
            <button onClick={() => setReplay(null)}>● Live</button>
          </>
        ) : (
          <>
            <span className="scrubber__live">● Live</span>
            <button onClick={() => setReplay({ index: 0, playing: true })} disabled={steps.length === 0}>↺ Replay session</button>
          </>
        )}
      </div>
    </section>
  )
}
