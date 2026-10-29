import { useEffect, useMemo, useState } from 'react'
import type { RecapEntry, StepExplanation } from '@sidecar/shared'
import { StatusStrip } from '../ds'
import { StageTab } from '../StageView'
import { DEMO, demoAt, demoElapsed } from './demo'

const SAMPLE_TEXT = 'This is a sample session, so you can see what Sidecar shows. Run claude in your project with the Developer Sidecar plugin, and your own work takes its place.'
// the same objects every render, so the stage's memos hold
const NO_EXPLANATIONS: Record<string, StepExplanation> = {}
const NO_RECAPS: Record<string, RecapEntry> = {}

/** The first-run demo: the sample session plays on the Stage, step by step, clearly marked SAMPLE. Browser only. */
export function DemoStage({ theme, reducedMotion }: { theme: 'light' | 'dark'; reducedMotion: boolean }) {
  // the clock outlives this component, so a trip to another tab does not start the sample over
  const [at, setAt] = useState(() => demoAt(demoElapsed(), DEMO.steps.length))
  useEffect(() => {
    // ticks twice a second, but only a new step, loop or ending re-renders
    const timer = setInterval(() => {
      const next = demoAt(demoElapsed(), DEMO.steps.length)
      setAt((prev) => (prev.count === next.count && prev.loop === next.loop && prev.done === next.done ? prev : next))
    }, 500)
    return () => clearInterval(timer)
  }, [])
  const { loop, count, done } = at
  const steps = useMemo(() => DEMO.steps.slice(0, count), [count])
  return (
    <>
      <StatusStrip tag="SAMPLE">{SAMPLE_TEXT}</StatusStrip>
      <StageTab
        // a new loop is a new session to the stage, so it starts clean
        sessionId={`demo-${loop}`}
        loaded
        steps={steps}
        explanations={NO_EXPLANATIONS}
        recaps={NO_RECAPS}
        project={DEMO.project}
        cwd={DEMO.cwd}
        liveTag="SAMPLE"
        attention={done ? 'done' : 'working'}
        theme={theme}
        reducedMotion={reducedMotion}
      />
    </>
  )
}
