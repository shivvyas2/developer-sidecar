import type { DecisionEntry, ExplainerState, FeedStep, GlossaryEntry, ServerMessage, SessionSummary, StepExplanation } from '@sidecar/shared'

export interface FeedState {
  sessions: SessionSummary[]
  selected: string | null
  steps: Record<string, FeedStep[]>
  lastSeq: number
  loaded: Record<string, boolean>
  explanations: Record<string, StepExplanation>
  decisions: Record<string, DecisionEntry[]>
  glossary: Record<string, GlossaryEntry[]>
  explainer: ExplainerState | null
}

export type FeedAction =
  | ServerMessage
  | { type: 'select'; id: string }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'steps'; sessionId: string; steps: FeedStep[] }
  | { type: 'decisions'; sessionId: string; decisions: DecisionEntry[] }
  | { type: 'glossary'; sessionId: string; entries: GlossaryEntry[] }

export const initialFeed: FeedState = { sessions: [], selected: null, steps: {}, lastSeq: 0, loaded: {},
  explanations: {}, decisions: {}, glossary: {}, explainer: null,
}

const byLastAt = (a: SessionSummary, b: SessionSummary) => b.lastAt - a.lastAt
const byTerm = (a: GlossaryEntry, b: GlossaryEntry) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' })
const byAt = (a: DecisionEntry, b: DecisionEntry) => a.at - b.at || a.id.localeCompare(b.id)
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
      return {
        ...state,
        steps: { ...state.steps, [s.sessionId]: next },
        explanations: s.explanation ? { ...state.explanations, [s.id]: s.explanation } : state.explanations,
        lastSeq,
      }
    }
    case 'steps': {
      // merge, don't replace: live steps may have arrived while this snapshot was in flight
      const merged = new Map((state.steps[action.sessionId] ?? []).map((s) => [s.id, s]))
      for (const s of action.steps) {
        const existing = merged.get(s.id)
        if (!existing || existing.seq < s.seq) merged.set(s.id, s)
      }
      const lastSeq = action.steps.reduce((m, s) => Math.max(m, s.seq), state.lastSeq)
      const explanations = { ...state.explanations }
      for (const s of action.steps) if (s.explanation) explanations[s.id] = s.explanation
      return {
        ...state,
        explanations,
        steps: { ...state.steps, [action.sessionId]: [...merged.values()].sort(byStart) },
        lastSeq,
        loaded: { ...state.loaded, [action.sessionId]: true },
      }
    }
    case 'select':
      return { ...state, selected: action.id }
    case 'explanation':
      return { ...state, explanations: { ...state.explanations, [action.stepId]: action.explanation } }
    case 'decision': {
      const d = action.decision
      const list = (state.decisions[d.sessionId] ?? []).filter((x) => x.id !== d.id)
      return { ...state, decisions: { ...state.decisions, [d.sessionId]: [...list, d].sort(byAt) } }
    }
    case 'decisions':
      return { ...state, decisions: { ...state.decisions, [action.sessionId]: [...action.decisions].sort(byAt) } }
    case 'concept': {
      const c = action.concept
      const list = state.glossary[c.sessionId] ?? []
      if (list.some((x) => x.term.trim().toLowerCase() === c.term.trim().toLowerCase())) return state
      return { ...state, glossary: { ...state.glossary, [c.sessionId]: [...list, c].sort(byTerm) } }
    }
    case 'glossary':
      return { ...state, glossary: { ...state.glossary, [action.sessionId]: [...action.entries].sort(byTerm) } }
    case 'explainer':
      return { ...state, explainer: action.state }
    case 'session_deleted': {
      const omit = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== action.id))
      const sessions = state.sessions.filter((x) => x.id !== action.id)
      return {
        ...state,
        sessions,
        selected: state.selected === action.id ? (sessions[0]?.id ?? null) : state.selected,
        steps: omit(state.steps),
        decisions: omit(state.decisions),
        glossary: omit(state.glossary),
        loaded: omit(state.loaded),
      }
    }
    case 'reset':
      return { ...initialFeed, explainer: state.explainer }
  }
}
