import type { FeedStep, ServerMessage, SessionSummary } from '@sidecar/shared'

export interface FeedState {
  sessions: SessionSummary[]
  selected: string | null
  steps: Record<string, FeedStep[]>
  lastSeq: number
}

export type FeedAction =
  | ServerMessage
  | { type: 'select'; id: string }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'steps'; sessionId: string; steps: FeedStep[] }

export const initialFeed: FeedState = { sessions: [], selected: null, steps: {}, lastSeq: 0 }

const byLastAt = (a: SessionSummary, b: SessionSummary) => b.lastAt - a.lastAt
const byStart = (a: FeedStep, b: FeedStep) => a.startedAt - b.startedAt || a.seq - b.seq

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'session': {
      const sessions = [...state.sessions.filter((s) => s.id !== action.session.id), action.session].sort(byLastAt)
      return { ...state, sessions, selected: state.selected ?? action.session.id }
    }
    case 'sessions':
      return { ...state, sessions: [...action.sessions].sort(byLastAt), selected: state.selected ?? action.sessions[0]?.id ?? null }
    case 'step': {
      const s = action.step
      const list = state.steps[s.sessionId] ?? []
      const existing = list.find((x) => x.id === s.id)
      const lastSeq = Math.max(state.lastSeq, s.seq)
      if (existing && existing.seq >= s.seq) return { ...state, lastSeq }
      const next = [...list.filter((x) => x.id !== s.id), s].sort(byStart)
      return { ...state, steps: { ...state.steps, [s.sessionId]: next }, lastSeq }
    }
    case 'steps': {
      const lastSeq = action.steps.reduce((m, s) => Math.max(m, s.seq), state.lastSeq)
      return { ...state, steps: { ...state.steps, [action.sessionId]: [...action.steps].sort(byStart) }, lastSeq }
    }
    case 'select':
      return { ...state, selected: action.id }
  }
}
