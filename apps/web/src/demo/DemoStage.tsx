import { useEffect, useState } from 'react'
import { StatusStrip } from '../ds'
import { StageTab } from '../StageView'
import { DEMO, demoAt } from './demo'

const SAMPLE_TEXT = 'This is a sample session, so you can see what Sidecar shows. Run claude in your project with the Developer Sidecar plugin, and your own work takes its place.'

/** The first-run demo: the sample session plays on the Stage, step by step, clearly marked SAMPLE. Browser only. */
export function DemoStage() {
  const [started] = useState(() => Date.now())
  const [now, setNow] = useState(started)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  const { loop, count, done } = demoAt(now - started, DEMO.steps.length)
  return (
    <>
      <StatusStrip tag="SAMPLE">{SAMPLE_TEXT}</StatusStrip>
      <StageTab
        // a new loop is a new session to the stage, so it starts clean
        sessionId={`demo-${loop}`}
        loaded
        steps={DEMO.steps.slice(0, count)}
        explanations={{}}
        recaps={{}}
        project={DEMO.project}
        cwd={DEMO.cwd}
        liveTag="SAMPLE"
        attention={done ? 'done' : 'working'}
      />
    </>
  )
}
