import { useEffect, useState } from 'react'
import { isExplained, type Category, type ExplainerState, type FeedStep, type StepExplanation } from '@sidecar/shared'
import { saveSettings } from './api'
import { DecisionsView } from './DecisionsView'
import { formatTokens } from './format'
import { GlossaryView } from './GlossaryView'
import { Kit } from './Kit'
import { SettingsView } from './SettingsView'
import { Stage } from './StageView'
import { useFeed } from './useFeed'

const ICON: Record<Category, string> = {
  prompt: '💬', subagent: '👥', mcp: '🤝', git: '📦', install: '🧰', test: '✅', deploy: '🚀',
  run: '🔑', data: '🗄️', external: '🔌', read: '🔍', create: '🧱', edit: '🔧', fallback: '💭',
}
const STATUS: Record<FeedStep['status'], string> = { running: '…', ok: '✓', failed: '✗', interrupted: '⏸' }

function StepRow({ step, explanation, explaining }: { step: FeedStep; explanation?: StepExplanation; explaining: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <li className={`step step--${step.status}`}>
      <span className="step__icon" aria-hidden>{ICON[step.category]}</span>
      <div className="step__body">
        <p className="step__caption">{step.caption}</p>
        {isExplained(explanation) ? (
          <div className="step__explain">
            <p className="step__plain">{explanation.plain}</p>
            <p className="step__why"><strong>Why it matters:</strong> {explanation.why}</p>
            {explanation.concept && <p className="step__concept"><span className="chip">{explanation.concept.term}</span> {explanation.concept.definition}</p>}
          </div>
        ) : explaining && !explanation && step.status !== 'running' && step.category !== 'prompt' ? (
          <p className="step__pending">Explaining…</p>
        ) : null}
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

type Tab = 'stage' | 'decisions' | 'glossary' | 'whiteboard' | 'settings'
const TABS: Array<[Tab, string]> = [
  ['stage', 'Stage'], ['decisions', 'Decisions'], ['glossary', 'Glossary'], ['whiteboard', 'Whiteboard'], ['settings', 'Settings'],
]
const WHITEBOARD = 'A live diagram of how your app fits together. Coming in v2.'

export function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash
}

export function App() {
  const hash = useHash()
  const { state, dispatch, connection } = useFeed()
  const [tab, setTab] = useState<Tab>('stage')
  if (hash === '#/kit') return <Kit />
  const steps = state.selected ? state.steps[state.selected] ?? [] : []
  const explaining = state.explainer?.status === 'ready'
  const selectedSession = state.sessions.find((x) => x.id === state.selected) ?? null
  const resume = () => {
    if (!state.explainer) return
    saveSettings({ explanations: state.explainer.level }).then((r) => dispatch({ type: 'explainer', state: r.explainer })).catch(() => undefined)
  }
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
        {state.explainer && state.explainer.level !== 'off' && (
          <span className="tokens" title="Tokens used for explanations">🧠 {formatTokens(state.explainer.tokens.input + state.explainer.tokens.output)} tokens</span>
        )}
        <a className="bar__link" href="#/kit">UI kit</a>
      </header>
      {state.explainer?.status === 'paused' && (
        <div className="banner" role="status">
          Explanations paused: {state.explainer.reason}
          <button onClick={resume}>Try again</button>
        </div>
      )}
      <nav className="tabs" role="tablist">
        {TABS.map(([id, name]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="tabs__tab" onClick={() => setTab(id)}>{name}</button>
        ))}
      </nav>
      <main>
        {tab === 'stage' && (
          <>
            <Stage sessionId={state.selected} loaded={state.selected ? !!state.loaded[state.selected] : false} steps={steps} />
            {steps.length === 0 ? (
              <p className="empty">Waiting for Claude to do something… start a Claude Code session with the plugin enabled.</p>
            ) : (
              <ol className="feed">{[...steps].reverse().map((s) => <StepRow key={s.id} step={s} explanation={state.explanations[s.id]} explaining={explaining} />)}</ol>
            )}
          </>
        )}
        {tab === 'decisions' && <DecisionsView decisions={state.selected ? state.decisions[state.selected] ?? [] : []} explaining={explaining} />}
        {tab === 'glossary' && <GlossaryView entries={state.selected ? state.glossary[state.selected] ?? [] : []} explaining={explaining} />}
        {tab === 'settings' && <SettingsView explainer={state.explainer} selected={selectedSession} onChanged={(s) => dispatch({ type: 'explainer', state: s })} />}
        {tab === 'whiteboard' && <p className="empty">{WHITEBOARD}</p>}
      </main>
    </div>
  )
}
