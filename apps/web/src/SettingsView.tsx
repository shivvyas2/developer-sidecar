import { useEffect, useState } from 'react'
import type { ExplainLevel, ExplainerState, SessionSummary } from '@sidecar/shared'
import { deleteAllSessions, deleteSession, fetchSettings, saveSettings } from './api'
import { ReadoutPanel, RotarySelect, type RotaryOption } from './ds'
import { formatTokens } from './format'
import type { MotionPref } from './city/motion'

const STATUS_TEXT: Record<ExplainerState['status'], string> = { ready: 'ON', paused: 'PAUSED', off: 'OFF', unavailable: 'N/A' }

const OPTIONS: RotaryOption<ExplainLevel>[] = [
  { value: 'off', label: 'OFF' },
  { value: 'haiku', label: 'QUICK' },
  { value: 'sonnet', label: 'DETAILED' },
]
const HINTS: Record<ExplainLevel, string> = {
  off: 'Off: no AI recaps. Nothing leaves your computer.',
  haiku: 'Quick (Haiku): one short recap each time Claude finishes, at low cost. Recommended.',
  sonnet: 'Detailed (Sonnet): richer recaps, higher cost.',
}

export function SettingsView({ explainer, selected, onChanged, motion, onMotion }: {
  /** How much the town moves; kept in this browser. */
  motion?: MotionPref
  onMotion?: (m: MotionPref) => void
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

  const provider = explainer?.provider ? (explainer.provider === 'api' ? 'API' : 'CLI') : '--'
  return (
    <section className="settings">
      <h2 className="settings__h">AI recaps</h2>
      <div className="settings__grid">
        <div className={level === null ? 'settings__dial settings__dial--wait' : 'settings__dial'}>
          <RotarySelect label="Recap level" value={level ?? 'off'} options={OPTIONS}
            disabled={level === null} busy={level === null} onChange={(v) => { if (level !== null) choose(v) }} />
          <p className="settings__hint">{level ? HINTS[level] : 'Loading...'}</p>
        </div>
        {explainer && (
          <div>
            <ReadoutPanel
              label="Explainer status"
              fields={[
                { label: 'STATUS', value: STATUS_TEXT[explainer.status] },
                { label: 'VIA', value: provider },
                { label: 'IN', value: formatTokens(explainer.tokens.input) },
                { label: 'OUT', value: formatTokens(explainer.tokens.output) },
              ]}
              {...(explainer.reason ? { note: explainer.reason } : {})}
            />
          </div>
        )}
      </div>
      <p className="settings__privacy">Each time Claude finishes, an AI recap sends a short summary of that turn (the steps in a line each, and the end of any failed output), with known secret patterns and .env values removed, to Anthropic directly or through your Claude Code login. File contents are never sent. Everything else stays on this computer.</p>
      {onMotion ? (
        <>
          <h2 className="settings__h">Motion</h2>
          <fieldset className="settings__motion">
            <legend className="settings__hint">How much the town moves. Less motion shows each piece of work finished at once, with its caption.</legend>
            {(['auto', 'reduce', 'full'] as const).map((m) => (
              <label key={m}>
                <input type="radio" name="motion" value={m} checked={motion === m} onChange={() => onMotion(m)} />
                {m === 'auto' ? ' Follow my computer' : m === 'reduce' ? ' Less motion' : ' Full motion'}
              </label>
            ))}
          </fieldset>
        </>
      ) : null}
      <h2 className="settings__h">Data</h2>
      <div className="settings__danger">
        <button type="button" className="settings__btn" onClick={removeSession} disabled={!selected}>Delete this session</button>
        <button type="button" className="settings__btn" onClick={removeAll}>Delete all sessions</button>
      </div>
      {error && <p className="settings__error" role="alert">{error}</p>}
    </section>
  )
}
