import { useEffect, useMemo, useState } from 'react'
import { projectMap, type FeedStep } from '@sidecar/shared'
import { saveSettings } from './api'
import { attentionNotice, liveAttention, liveTag, sessionMark, titleFor } from './attention'
import { SidecarMark } from './brand/Brand'
import { DecisionsView } from './DecisionsView'
import { DemoStage } from './demo/DemoStage'
import { FolderTabs, StatusStrip, ThemeToggle, type FolderTab } from './ds'
import { formatTokens } from './format'
import { GlossaryView } from './GlossaryView'
import { Kit } from './Kit'
import { SettingsView } from './SettingsView'
import { tabFromSearch } from './selection'
import { StageTab } from './StageView'
import { applyTheme, initialTheme, safeStorage, writeTheme, type ThemePref } from './theme'
import { useFeed } from './useFeed'
import { WhiteboardView } from './WhiteboardView'
import { readMotion, reduceMotion, writeMotion, type MotionPref } from './city/motion'
import { useOsReducedMotion, useResolvedTheme } from './city/view'
import { liveStepId } from './whiteboard'

type Tab = 'stage' | 'decisions' | 'glossary' | 'whiteboard' | 'settings'
const TABS: FolderTab[] = [
  { id: 'stage', label: 'Stage' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'whiteboard', label: 'Whiteboard' },
  { id: 'settings', label: 'Settings' },
]
const CONNECTION = { connecting: 'CONNECTING', live: 'LIVE', offline: 'OFFLINE' } as const
/** A blip shorter than this (a reload of the server, a brief sleep) does not raise the offline banner. */
const OFFLINE_GRACE_MS = 3000
const OFFLINE_TEXT = 'Lost the connection to Sidecar, trying again every few seconds. An open Claude Code session usually restarts it; '
  + 'if not, starting a new Claude Code session will. What you see below is from before the connection dropped.'

/** True once `on` has held for `ms`; false again as soon as it stops. */
function useHeld(on: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (!on) { setHeld(false); return }
    const t = setTimeout(() => setHeld(true), ms)
    return () => clearTimeout(t)
  }, [on, ms])
  return held
}

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

const NO_STEPS: FeedStep[] = []

const projectName = (cwd: string, id: string) => cwd.split('/').filter(Boolean).pop() || id

export function App() {
  const hash = useHash()
  const { state, dispatch, connection, retry } = useFeed()
  const offline = useHeld(connection === 'offline', OFFLINE_GRACE_MS)
  const [tab, setTabRaw] = useState<Tab>(() => tabFromSearch(location.search, TABS.map((t) => t.id as Tab), 'stage'))
  const [pickRequest, setPickRequest] = useState<string | null>(null)
  const setTab = (t: Tab) => { setPickRequest(null); setTabRaw(t) }
  const pickStep = (id: string) => { setPickRequest(id); setTabRaw('stage') }
  const [theme, setTheme] = useTheme()
  const shownTheme = useResolvedTheme(theme)
  const [motion, setMotionRaw] = useState<MotionPref>(() => readMotion(safeStorage()))
  const setMotion = (m: MotionPref) => { setMotionRaw(m); writeMotion(safeStorage(), m) }
  const reducedMotion = reduceMotion(motion, useOsReducedMotion())
  const title = titleFor(state.sessions)
  useEffect(() => { document.title = title }, [title])
  const sid = state.selected
  const steps = sid ? state.steps[sid] ?? NO_STEPS : NO_STEPS
  const selectedSession = state.sessions.find((x) => x.id === sid) ?? null
  const cwd = selectedSession?.cwd
  // Built once per new step, not on every render: the map reads every schema Claude wrote.
  const map = useMemo(() => projectMap(steps, cwd), [steps, cwd])
  if (hash === '#/kit') return <Kit />
  const explainer = state.explainer
  const status = explainer?.status ?? null
  const project = selectedSession ? projectName(selectedSession.cwd, selectedSession.id) : undefined
  const notice = attentionNotice(selectedSession)
  const tag = liveTag(selectedSession, offline)
  const attention = liveAttention(selectedSession, offline)
  const fresh = state.sessions.find((x) => x.id === state.newSession) ?? null
  // no sessions yet: the Stage plays the sample, clearly marked, until a real one arrives
  const demo = state.listed && state.sessions.length === 0
  const resume = () => {
    if (!explainer) return
    saveSettings({ explanations: explainer.level }).then((r) => dispatch({ type: 'explainer', state: r.explainer })).catch(() => undefined)
  }
  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr__brand">
          <SidecarMark size={52} tight />
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
                      {projectName(s.cwd, s.id)} · {new Date(s.lastAt).toLocaleTimeString()}{sessionMark(s)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>
        </div>
        <div className="hdr__tools">
          {explainer && explainer.level !== 'off' ? (
            <span className="hdr__tokens" title="Tokens used for AI recaps">
              <span className="hdr__tokens-k">TOKENS</span>
              <span className="hdr__tokens-v">{formatTokens(explainer.tokens.input + explainer.tokens.output)}</span>
            </span>
          ) : null}
          <ThemeToggle pref={theme} onChange={setTheme} />
          <a className="hdr__kit" href="#/kit">KIT</a>
        </div>
      </header>
      <FolderTabs tabs={TABS} active={tab} onSelect={(id) => setTab(id as Tab)} />
      {offline ? (
        <StatusStrip tag="OFFLINE" tone="alert" action={{ label: '↻', title: 'Try now', onPress: retry }}>
          {OFFLINE_TEXT}
        </StatusStrip>
      ) : null}
      {notice && !offline ? (
        <StatusStrip tag={notice.tag} {...(selectedSession?.attention === 'permission' ? { tone: 'alert' as const } : {})}>
          {notice.text}
        </StatusStrip>
      ) : null}
      {fresh ? (
        <StatusStrip tag="NEW SESSION" action={{ label: '→', title: 'Switch to it', onPress: () => dispatch({ type: 'select', id: fresh.id }) }}>
          {projectName(fresh.cwd, fresh.id)} started in another Claude Code window.
        </StatusStrip>
      ) : null}
      {status === 'paused' ? (
        <StatusStrip tag="PAUSED" action={{ label: '↻', title: 'Try again', onPress: resume }}>
          AI recaps paused: {explainer?.reason}
        </StatusStrip>
      ) : status === 'unavailable' ? (
        <StatusStrip tag="OFF" action={{ label: '→', title: 'Open settings', onPress: () => setTab('settings') }}>
          AI recaps are not available{explainer?.reason ? `: ${explainer.reason}` : '.'}
        </StatusStrip>
      ) : null}
      <main className="panel" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label ?? 'Stage'}>
        {tab === 'stage' && demo && <DemoStage theme={shownTheme} reducedMotion={reducedMotion} />}
        {tab === 'stage' && !demo && (
          <StageTab
            sessionId={sid}
            loaded={sid ? !!state.loaded[sid] : false}
            steps={steps}
            explanations={state.explanations}
            recaps={sid ? state.recaps[sid] ?? {} : {}}
            pickRequest={pickRequest}
            {...(tag ? { liveTag: tag } : {})}
            {...(attention ? { attention } : {})}
            {...(cwd ? { cwd } : {})}
            map={map}
            {...(project ? { project } : {})}
            {...(sid && state.baselines[sid] ? { baseline: state.baselines[sid] } : {})}
            theme={shownTheme}
            reducedMotion={reducedMotion}
            onGlossary={() => setTab('glossary')}
          />
        )}
        {tab === 'decisions' && <div className="panel__narrow"><DecisionsView decisions={sid ? state.decisions[sid] ?? [] : []} status={status} stepIds={steps.map((x) => x.id)} onPick={pickStep} /></div>}
        {tab === 'glossary' && <div className="panel__narrow"><GlossaryView entries={sid ? state.glossary[sid] ?? [] : []} status={status} {...(project ? { project } : {})} /></div>}
        {tab === 'settings' && <div className="panel__narrow"><SettingsView explainer={explainer} selected={selectedSession} onChanged={(s) => dispatch({ type: 'explainer', state: s })} motion={motion} onMotion={setMotion} /></div>}
        {tab === 'whiteboard' && (
          <WhiteboardView map={map} stepIds={steps.map((x) => x.id)} liveId={liveStepId(steps, attention)} onPick={pickStep} />
        )}
      </main>
    </div>
  )
}
