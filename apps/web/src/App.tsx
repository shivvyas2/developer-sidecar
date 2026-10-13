import { useState } from 'react'
import type { Category, FeedStep } from '@sidecar/shared'
import { useFeed } from './useFeed'

const ICON: Record<Category, string> = {
  prompt: '💬', subagent: '👥', mcp: '🤝', git: '📦', install: '🧰', test: '✅', deploy: '🚀',
  run: '🔑', data: '🗄️', external: '🔌', read: '🔍', create: '🧱', edit: '🔧', fallback: '💭',
}
const STATUS: Record<FeedStep['status'], string> = { running: '…', ok: '✓', failed: '✗', interrupted: '⏸' }

function StepRow({ step }: { step: FeedStep }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`step step--${step.status}`}>
      <span className="step__icon" aria-hidden>{ICON[step.category]}</span>
      <div className="step__body">
        <p className="step__caption">{step.caption}</p>
        <button className="step__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide technical' : 'Show technical'}
        </button>
        {open && (
          <pre className="step__tech">
            {step.techLabel}
            {step.output !== undefined ? `\n\n${JSON.stringify(step.output, null, 2)}` : ''}
          </pre>
        )}
      </div>
      <span className="step__status" title={step.status}>{STATUS[step.status]}</span>
    </li>
  )
}

export function App() {
  const { state, dispatch, connection } = useFeed()
  const steps = state.selected ? state.steps[state.selected] ?? [] : []
  return (
    <div className="app">
      <header className="bar">
        <h1>🛰️ Developer Sidecar</h1>
        <span className={`dot dot--${connection}`}>{connection}</span>
        <select
          aria-label="Session"
          value={state.selected ?? ''}
          onChange={(e) => dispatch({ type: 'select', id: e.target.value })}
        >
          {state.sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.cwd.split('/').pop() || s.id} · {new Date(s.lastAt).toLocaleTimeString()}
            </option>
          ))}
        </select>
      </header>
      <main>
        {steps.length === 0 ? (
          <p className="empty">Waiting for Claude to do something… start a Claude Code session with the plugin enabled.</p>
        ) : (
          <ol className="feed">{steps.map((s) => <StepRow key={s.id} step={s} />)}</ol>
        )}
      </main>
    </div>
  )
}
