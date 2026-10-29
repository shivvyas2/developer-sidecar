import { useEffect, useMemo, useRef, useState } from 'react'
import {
  cameraMode, CONCEPTS, conceptOfBuilding, initialPacer, pace, sceneOf, storyOf, townOf,
  type Attention, type Baseline, type FeedStep, type PacerState,
} from '@sidecar/shared'
import { conceptAt } from './conceptView'
import { CityRenderer, type CityTheme } from './renderer'

export interface CityStageProps {
  steps: FeedStep[]
  /** The step the town is shown at: the newest while live, an older one while replaying. */
  upTo: number
  live: boolean
  baseline?: Baseline
  cwd?: string
  attention?: Attention
  theme: CityTheme
  reducedMotion: boolean
  /** A building or a step's scene was tapped. */
  onPick(target: { building?: string; stepId?: string }): void
}

/**
 * The town, drawn by CityRenderer from the session's steps and scan. New steps play as scenes, paced so the
 * town never runs behind; while replaying, the town is rebuilt as it stood at `upTo` and that step plays.
 */
export function CityStage({ steps, upTo, live, baseline, cwd, attention, theme, reducedMotion, onPick }: CityStageProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<CityRenderer | null>(null)
  const pacer = useRef<PacerState>(initialPacer)
  const playing = useRef(false)
  const shownUpTo = useRef(-1)
  const [following, setFollowing] = useState(true)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)

  const upToSteps = useMemo(() => steps.slice(0, upTo + 1), [steps, upTo])
  const town = useMemo(() => townOf(upToSteps, { ...(cwd ? { cwd } : {}), ...(baseline ? { baseline } : {}) }), [upToSteps, cwd, baseline])
  const fixers = useMemo(() => new Set(storyOf(steps).flatMap((c) => c.beats.flatMap((b) => (b.type === 'step' && b.fixes ? [b.id] : [])))), [steps])

  useEffect(() => {
    const r = new CityRenderer(canvas.current!, { theme, reducedMotion })
    renderer.current = r
    r.onUserCamera(() => setFollowing(false))
    const fit = () => { const el = wrap.current!; r.resize(el.clientWidth, el.clientHeight) }
    const ro = new ResizeObserver(fit); ro.observe(wrap.current!); fit()
    return () => { ro.disconnect(); r.dispose(); renderer.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one renderer for the component's life; theme and motion update below
  }, [])
  useEffect(() => { renderer.current?.setTheme(theme) }, [theme])
  useEffect(() => { renderer.current?.setReducedMotion(reducedMotion) }, [reducedMotion])
  useEffect(() => { renderer.current?.setTown(town) }, [town])

  // new steps become scenes; a jump (replay, or catching up) plays just the step shown
  useEffect(() => {
    const r = renderer.current
    if (!r || upTo < 0) return
    const now = performance.now()
    const waiting = attention === 'permission'
    const scene = (s: FeedStep) => sceneOf(s, town, { ...(cwd ? { cwd } : {}), fixes: fixers.has(s.id), waiting: waiting && s === steps[upTo] && s.status === 'running' })
    const from = shownUpTo.current
    shownUpTo.current = upTo
    if (!live || from < 0 || upTo < from || upTo - from > 50) {
      pacer.current = pace(pacer.current, { type: 'catchUp', scene: scene(steps[upTo]!), t: now })
    } else if (upTo > from) {
      pacer.current = pace(pacer.current, { type: 'arrive', scenes: steps.slice(from + 1, upTo + 1).map(scene), t: now })
    } else return
    r.setCamera(cameraMode(pacer.current, now))
    const run = async () => {
      if (playing.current) return
      playing.current = true
      while (pacer.current.playing && renderer.current) {
        await renderer.current.play(pacer.current.playing)
        pacer.current = pace(pacer.current, { type: 'done', t: performance.now() })
        renderer.current?.setCamera(cameraMode(pacer.current, performance.now()))
      }
      playing.current = false
    }
    void run()
  }, [upTo, live, steps, town, cwd, attention, fixers])

  const hover = (e: React.PointerEvent) => {
    const r = renderer.current, rect = canvas.current!.getBoundingClientRect()
    const target = r?.pick(e.clientX - rect.left, e.clientY - rect.top)
    const id = target ? conceptAt(target, town, steps) : null
    const name = target?.building ? town.buildings.find((b) => b.id === target.building)?.name : undefined
    setTip(id ? { x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${name ?? CONCEPTS[id].city}: ${CONCEPTS[id].glossaryTerm ?? id}` } : null)
    canvas.current!.style.cursor = id ? 'pointer' : ''
  }
  const click = (e: React.MouseEvent) => {
    const rect = canvas.current!.getBoundingClientRect()
    const target = renderer.current?.pick(e.clientX - rect.left, e.clientY - rect.top)
    if (target) onPick(target)
  }

  return (
    <div className="city" ref={wrap} data-stage={town.stage}>
      <canvas ref={canvas} className="city__canvas" onPointerMove={hover} onPointerLeave={() => setTip(null)} onClick={click}
        aria-label={`Your project as a town, ${town.buildings.length} buildings, stage ${town.stage}`} />
      {tip && <div className="city__tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      {/* the town for keyboards and screen readers: every building, each opening its card */}
      <ul className="sr-only" aria-label="Buildings in the town">
        {town.buildings.map((b) => (
          <li key={b.id}><button type="button" onClick={() => onPick({ building: b.id })}>{b.name}: {CONCEPTS[conceptOfBuilding(b)].city}</button></li>
        ))}
      </ul>
      {!following && <button type="button" className="city__follow" onClick={() => { renderer.current?.follow(); setFollowing(true) }}>Follow</button>}
    </div>
  )
}
