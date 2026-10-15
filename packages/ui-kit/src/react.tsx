import { useEffect, useMemo, useRef, useState } from 'react'
import type { SceneSpec } from '@sidecar/shared'
import { render, type Readout } from './render'
import { compile } from './timeline'
import type { Town } from './town'

export interface SceneProps {
  spec: SceneSpec
  town?: Town
  /** Fixed time in ms. When set, the scene is a still frame. */
  at?: number
  /** Restart from the beginning when finished (the /kit gallery uses this). */
  loop?: boolean
  /** Called once when a non-looping scene finishes. */
  onDone?: () => void
  className?: string
  /** Draw the stage frame (header, session arc, readout panel, status strip). */
  frame?: boolean
  /** The frame's numbers. */
  readout?: Readout
}

/** How long a reduced-motion still frame stays up before onDone, so live playback keeps moving. */
export const REDUCED_MOTION_HOLD_MS = 1500

export const specKey = (spec: SceneSpec): string => JSON.stringify(spec)

export const startTime = (at: number | undefined, reduced: boolean, duration: number): number =>
  at ?? (reduced ? duration : 0)

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function Scene({ spec, town, at, loop = false, onDone, className, frame, readout }: SceneProps) {
  const key = specKey(spec)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content so an equal spec does not restart
  const timeline = useMemo(() => compile(spec), [key])
  const [t, setT] = useState(() => startTime(at, prefersReducedMotion(), timeline.duration))
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (at !== undefined) return
    if (prefersReducedMotion()) {
      setT(timeline.duration)
      if (loop) return
      const id = setTimeout(() => done.current?.(), REDUCED_MOTION_HOLD_MS)
      return () => clearTimeout(id)
    }
    setT(0)
    let raf = 0
    let start = -1
    const tick = (now: number) => {
      if (start < 0) start = now
      const elapsed = now - start
      if (loop) {
        setT(elapsed % timeline.duration)
      } else if (elapsed >= timeline.duration) {
        setT(timeline.duration)
        done.current?.()
        return
      } else {
        setT(elapsed)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [timeline, at, loop])

  const svg = useMemo(
    () => render(spec, at ?? t, { timeline, ...(town ? { town } : {}), ...(frame ? { frame } : {}), ...(readout ? { readout } : {}) }),
    [key, at, t, town, timeline, frame, readout], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return <div className={className ?? 'sk-stage'} dangerouslySetInnerHTML={{ __html: svg }} />
}
