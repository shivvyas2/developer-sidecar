import { useEffect, useState } from 'react'
import type { ExplainLevel, ExplainerState, SessionSummary } from '@sidecar/shared'
import { deleteAllSessions, deleteSession, fetchSettings, saveSettings } from './api'
import { ReadoutPanel, RotarySelect, type RotaryOption } from './ds'
import { formatTokens } from './format'

const STATUS_TEXT: Record<ExplainerState['status'], string> = { ready: 'ON', paused: 'PAUSED', off: 'OFF', unavailable: 'N/A' }

const OPTIONS: RotaryOption<ExplainLevel>[] = [
  { value: 'off', label: 'OFF' },
  { value: 'haiku', label: 'QUICK' },
  { value: 'sonnet', label: 'DETAILED' },
]
const HINTS: Record<ExplainLevel, string> = {
  off: 'Off: no explanations. Nothing leaves your computer.',
  haiku: 'Quick (Haiku): fast, low-cost explanations. Recommended.',
  sonnet: 'Detailed (Sonnet): richer explanations, higher cost.',
}

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

  const provider = explainer?.provider ? (explainer.provider === 'api' ? 'API' : 'CLI') : '--'
  return (
    <section className="settings">
      <h2 className="settings__h">Plain-English explanations</h2>
      <div className="settings__grid">
        <div className={level === null ? 'settings__dial settings__dial--wait' : 'settings__dial'}>
          <RotarySelect label="Explanation level" value={level ?? 'off'} options={OPTIONS} onChange={(v) => { if (level !== null) choose(v) }} />
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
      <p className="settings__privacy">Explanations send step details, with known secret patterns and .env values removed, to Anthropic directly or through your Claude Code login. Everything else stays on this computer.</p>
      <h2 className="settings__h">Data</h2>
      <div className="settings__danger">
        <button type="button" className="settings__btn" onClick={removeSession} disabled={!selected}>Delete this session</button>
        <button type="button" className="settings__btn" onClick={removeAll}>Delete all sessions</button>
      </div>
      {error && <p className="settings__error" role="alert">{error}</p>}
    </section>
  )
}
