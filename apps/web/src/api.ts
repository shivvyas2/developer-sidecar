import type { Baseline, DecisionEntry, ExplainerState, FeedStep, GlossaryEntry, RecapEntry, SessionSummary, Settings } from '@sidecar/shared'

export const token = document.querySelector<HTMLMetaElement>('meta[name="sidecar-token"]')?.content ?? ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { 'x-sidecar-token': token } })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return (await res.json()) as T
}

export const fetchSessions = () => get<SessionSummary[]>('/api/sessions')
export const fetchSteps = (id: string) => get<FeedStep[]>(`/api/sessions/${encodeURIComponent(id)}/steps`)

async function send<T>(method: 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'x-sidecar-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
  return (await res.json()) as T
}

export const fetchExplainer = () => get<ExplainerState>('/api/explainer')
export const fetchDecisions = (id: string) => get<DecisionEntry[]>(`/api/sessions/${encodeURIComponent(id)}/decisions`)
export const fetchGlossary = (id: string) => get<GlossaryEntry[]>(`/api/sessions/${encodeURIComponent(id)}/glossary`)
export const fetchBaseline = (id: string) => get<Baseline | null>(`/api/sessions/${encodeURIComponent(id)}/baseline`)
export const fetchRecaps = (id: string) => get<RecapEntry[]>(`/api/sessions/${encodeURIComponent(id)}/recaps`)
export const fetchSettings = () => get<Settings>('/api/settings')
export const saveSettings = (s: Settings) => send<{ settings: Settings; explainer: ExplainerState }>('PUT', '/api/settings', s)
export const deleteSession = (id: string) => send<{ ok: true }>('DELETE', `/api/sessions/${encodeURIComponent(id)}`)
export const deleteAllSessions = () => send<{ ok: true }>('DELETE', '/api/sessions')
