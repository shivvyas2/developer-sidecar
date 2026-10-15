import { useEffect, useState } from 'react'
import { saveSettings } from './api'
import { DecisionsView } from './DecisionsView'
import { FolderTabs, StatusStrip, ThemeToggle, type FolderTab } from './ds'
import { formatTokens } from './format'
import { GlossaryView } from './GlossaryView'
import { Kit } from './Kit'
import { SettingsView } from './SettingsView'
import { StageTab } from './StageView'
import { applyTheme, initialTheme, safeStorage, writeTheme, type ThemePref } from './theme'
import { useFeed } from './useFeed'

type Tab = 'stage' | 'decisions' | 'glossary' | 'whiteboard' | 'settings'
const TABS: FolderTab[] = [
  { id: 'stage', label: 'Stage' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'whiteboard', label: 'Whiteboard' },
  { id: 'settings', label: 'Settings' },
]
const WHITEBOARD = 'A live diagram of how your app fits together. Coming in v2.'
const CONNECTION = { connecting: 'CONNECTING', live: 'LIVE', offline: 'OFFLINE' } as const

export function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return hash
}

function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => initialTheme(location.search, safeStorage()))
  const change = (p: ThemePref) => {
    setPref(p)
    writeTheme(safeStorage(), p)
    applyTheme(document.documentElement, p)
  }
  return [pref, change]
}

const projectName = (cwd: string, id: string) => cwd.split('/').filter(Boolean).pop() || id

export function App() {
  const hash = useHash()
  const { state, dispatch, connection } = useFeed()
  const [tab, setTab] = useState<Tab>('stage')
  const [theme, setTheme] = useTheme()
  if (hash === '#/kit') return <Kit />
  const sid = state.selected
  const steps = sid ? state.steps[sid] ?? [] : []
  const explainer = state.explainer
  const status = explainer?.status ?? null
  const selectedSession = state.sessions.find((x) => x.id === sid) ?? null
  const project = selectedSession ? projectName(selectedSession.cwd, selectedSession.id) : undefined
  const resume = () => {
    if (!explainer) return
    saveSettings({ explanations: explainer.level }).then((r) => dispatch({ type: 'explainer', state: r.explainer })).catch(() => undefined)
  }
  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr__id">
          <h1 className="hdr__title">DEVELOPER SIDECAR</h1>
          <div className="hdr__meta">
            <span className="hdr__pip" data-state={connection} title={`Connection: ${connection}`}>
              <span aria-hidden>●</span> {CONNECTION[connection]}
            </span>
            {state.sessions.length > 0 ? (
              <select
                className="hdr__session"
                aria-label="Session"
                value={sid ?? ''}
                onChange={(e) => dispatch({ type: 'select', id: e.target.value })}
              >
                {state.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {projectName(s.cwd, s.id)} · {new Date(s.lastAt).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>
        <div className="hdr__tools">
          {explainer && explainer.level !== 'off' ? (
            <span className="hdr__tokens" title="Tokens used for explanations">
              <span className="hdr__tokens-k">TOKENS</span>
              <span className="hdr__tokens-v">{formatTokens(explainer.tokens.input + explainer.tokens.output)}</span>
            </span>
          ) : null}
          <ThemeToggle pref={theme} onChange={setTheme} />
          <a className="hdr__kit" href="#/kit">KIT</a>
        </div>
      </header>
      <FolderTabs tabs={TABS} active={tab} onSelect={(id) => setTab(id as Tab)} />
      {status === 'paused' ? (
        <StatusStrip tag="PAUSED" action={{ label: '↻', title: 'Try again', onPress: resume }}>
          Explanations paused: {explainer?.reason}
        </StatusStrip>
      ) : status === 'unavailable' ? (
        <StatusStrip tag="OFF" action={{ label: '⚙', title: 'Open settings', onPress: () => setTab('settings') }}>
          Explanations are not available{explainer?.reason ? `: ${explainer.reason}` : '.'}
        </StatusStrip>
      ) : null}
      <main className="panel" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label ?? 'Stage'}>
        {tab === 'stage' && (
          <StageTab
            sessionId={sid}
            loaded={sid ? !!state.loaded[sid] : false}
            steps={steps}
            explanations={state.explanations}
            explainer={explainer}
            readySince={state.readySince}
            {...(project ? { project } : {})}
          />
        )}
        {tab === 'decisions' && <div className="panel__narrow"><DecisionsView decisions={sid ? state.decisions[sid] ?? [] : []} status={status} /></div>}
        {tab === 'glossary' && <div className="panel__narrow"><GlossaryView entries={sid ? state.glossary[sid] ?? [] : []} status={status} /></div>}
        {tab === 'settings' && <div className="panel__narrow"><SettingsView explainer={explainer} selected={selectedSession} onChanged={(s) => dispatch({ type: 'explainer', state: s })} /></div>}
        {tab === 'whiteboard' && <p className="empty">{WHITEBOARD}</p>}
      </main>
    </div>
  )
}
