import type { FeedStep, SessionSummary } from '@sidecar/shared'

export const token = document.querySelector<HTMLMetaElement>('meta[name="sidecar-token"]')?.content ?? ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { 'x-sidecar-token': token } })
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return (await res.json()) as T
}

export const fetchSessions = () => get<SessionSummary[]>('/api/sessions')
export const fetchSteps = (id: string) => get<FeedStep[]>(`/api/sessions/${encodeURIComponent(id)}/steps`)
