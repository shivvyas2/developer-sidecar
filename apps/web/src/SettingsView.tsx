import { useEffect, useState } from 'react'
import type { ExplainLevel, ExplainerState, SessionSummary } from '@sidecar/shared'
import { deleteAllSessions, deleteSession, fetchSettings, saveSettings } from './api'
import { formatTokens } from './format'

const STATUS_TEXT: Record<ExplainerState['status'], string> = { ready: 'On', paused: 'Paused', off: 'Off', unavailable: 'Not available' }

const LEVELS: Array<[ExplainLevel, string, string]> = [
  ['off', 'Off', 'No explanations. Nothing leaves your computer.'],
  ['haiku', 'Quick (Haiku)', 'Fast, low-cost explanations. Recommended.'],
  ['sonnet', 'Detailed (Sonnet)', 'Richer explanations, higher cost.'],
]

export function SettingsView({ explainer, selected, onChanged }: {
  explainer: ExplainerState | null
  selected: SessionSummary | null
  onChanged: (s: ExplainerState) => void
}) {
  const [level, setLevel] = useState<ExplainLevel | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { fetchSettings().then((s) => setLevel(s.explanations)).catch(() => setError('Could not load settings.')) }, [])

  const choose = (next: ExplainLevel) => {
    const previous = level
    setLevel(next)
    setError(null)
    saveSettings({ explanations: next }).then((r) => onChanged(r.explainer)).catch(() => {
      setLevel(previous)
      setError('Could not save settings.')
    })
  }
  const removeSession = () => {
    if (!selected || !confirm(`Delete the session "${selected.cwd.split('/').pop() || selected.id}" and everything recorded for it?`)) return
    deleteSession(selected.id).catch(() => setError('Could not delete the session.'))
  }
  const removeAll = () => {
    if (!confirm('Delete every recorded session? This cannot be undone.')) return
    deleteAllSessions().catch(() => setError('Could not delete sessions.'))
  }

  return (
    <section className="settings">
      <h2>Plain-English explanations</h2>
      <fieldset className="settings__levels" disabled={level === null}>
        <legend className="sr-only">Explanation level</legend>
        {LEVELS.map(([id, name, hint]) => (
          <label key={id} className="settings__level">
            <input type="radio" name="level" value={id} checked={level === id} onChange={() => choose(id)} />
            <span><strong>{name}</strong><br /><small>{hint}</small></span>
          </label>
        ))}
      </fieldset>
      {explainer && (
        <p className="settings__status">
          Status: <strong>{STATUS_TEXT[explainer.status]}</strong>
          {explainer.provider && <> via {explainer.provider === 'api' ? 'the Anthropic API' : 'Claude Code'}</>}
          {explainer.reason && <> — {explainer.reason}</>}
          <br />Tokens used so far: {formatTokens(explainer.tokens.input)} in, {formatTokens(explainer.tokens.output)} out.
        </p>
      )}
      <p className="settings__privacy">Explanations send step details, with known secret patterns and .env values removed, to Anthropic directly or through your Claude Code login. Everything else stays on this computer.</p>
      <h2>Data</h2>
      <div className="settings__danger">
        <button onClick={removeSession} disabled={!selected}>Delete this session</button>
        <button onClick={removeAll}>Delete all sessions</button>
      </div>
      {error && <p className="settings__error" role="alert">{error}</p>}
    </section>
  )
}
