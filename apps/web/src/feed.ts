import type { DecisionEntry, ExplainerState, FeedStep, GlossaryEntry, RecapEntry, ServerMessage, SessionSummary, StepExplanation } from '@sidecar/shared'

export interface FeedState {
  sessions: SessionSummary[]
  selected: string | null
  steps: Record<string, FeedStep[]>
  lastSeq: number
  loaded: Record<string, boolean>
  /** Explanations stored before recaps replaced them; they ride along with a session's steps. */
  explanations: Record<string, StepExplanation>
  /** Each session's AI recaps, by the turn (prompt step id) they sum up. */
  recaps: Record<string, Record<string, RecapEntry>>
  decisions: Record<string, DecisionEntry[]>
  glossary: Record<string, GlossaryEntry[]>
  explainer: ExplainerState | null
  /** A session that started while another was being watched, offered until the person switches. */
  newSession: string | null
}

export type FeedAction =
  | ServerMessage
  | { type: 'select'; id: string }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'steps'; sessionId: string; steps: FeedStep[] }
  | { type: 'decisions'; sessionId: string; decisions: DecisionEntry[] }
  | { type: 'glossary'; sessionId: string; entries: GlossaryEntry[] }
  | { type: 'recaps'; sessionId: string; recaps: RecapEntry[] }

export const initialFeed: FeedState = { sessions: [], selected: null, steps: {}, lastSeq: 0, loaded: {},
  explanations: {}, recaps: {}, decisions: {}, glossary: {}, explainer: null, newSession: null,
}

const byLastAt = (a: SessionSummary, b: SessionSummary) => b.lastAt - a.lastAt
const byTerm = (a: GlossaryEntry, b: GlossaryEntry) => a.term.localeCompare(b.term, undefined, { sensitivity: 'base' })
const byAt = (a: DecisionEntry, b: DecisionEntry) => a.at - b.at || a.id.localeCompare(b.id)
const termKey = (term: string) => term.trim().toLowerCase()
const byStart = (a: FeedStep, b: FeedStep) => a.startedAt - b.startedAt || a.seq - b.seq

export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case 'session': {
      const id = action.session.id
      const sessions = [...state.sessions.filter((s) => s.id !== id), action.session].sort(byLastAt)
      const fresh = !state.sessions.some((s) => s.id === id) && state.selected !== null && state.selected !== id
      return { ...state, sessions, selected: state.selected ?? id, newSession: fresh ? id : state.newSession }
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
      return { ...state, selected: action.id, newSession: null }
    case 'decision': {
      const d = action.decision
      const list = (state.decisions[d.sessionId] ?? []).filter((x) => x.id !== d.id)
      return { ...state, decisions: { ...state.decisions, [d.sessionId]: [...list, d].sort(byAt) } }
    }
    case 'decisions': {
      // merge, don't replace: live decisions may have arrived while this snapshot was in flight
      const merged = new Map((state.decisions[action.sessionId] ?? []).map((d) => [d.id, d]))
      for (const d of action.decisions) merged.set(d.id, d)
      return { ...state, decisions: { ...state.decisions, [action.sessionId]: [...merged.values()].sort(byAt) } }
    }
    case 'concept': {
      const c = action.concept
      const list = state.glossary[c.sessionId] ?? []
      if (list.some((x) => termKey(x.term) === termKey(c.term))) return state
      return { ...state, glossary: { ...state.glossary, [c.sessionId]: [...list, c].sort(byTerm) } }
    }
    case 'glossary': {
      // merge, the entry already shown wins
      const merged = new Map(action.entries.map((e) => [termKey(e.term), e]))
      for (const e of state.glossary[action.sessionId] ?? []) merged.set(termKey(e.term), e)
      return { ...state, glossary: { ...state.glossary, [action.sessionId]: [...merged.values()].sort(byTerm) } }
    }
    case 'explainer':
      return { ...state, explainer: action.state }
    case 'recap': {
      const r = action.recap
      return { ...state, recaps: { ...state.recaps, [r.sessionId]: { ...state.recaps[r.sessionId], [r.turnId]: r } } }
    }
    case 'recaps': {
      // merge: a live recap newer than the snapshot wins
      const merged = { ...state.recaps[action.sessionId] }
      for (const r of action.recaps) if (!merged[r.turnId] || merged[r.turnId]!.at <= r.at) merged[r.turnId] = r
      return { ...state, recaps: { ...state.recaps, [action.sessionId]: merged } }
    }
    case 'session_deleted': {
      const omit = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== action.id))
      const sessions = state.sessions.filter((x) => x.id !== action.id)
      const gone = new Set((state.steps[action.id] ?? []).map((x) => x.id))
      return {
        ...state,
        sessions,
        selected: state.selected === action.id ? (sessions[0]?.id ?? null) : state.selected,
        newSession: state.newSession === action.id ? null : state.newSession,
        steps: omit(state.steps),
        decisions: omit(state.decisions),
        glossary: omit(state.glossary),
        recaps: omit(state.recaps),
        loaded: omit(state.loaded),
        explanations: Object.fromEntries(Object.entries(state.explanations).filter(([k]) => !gone.has(k))),
      }
    }
    case 'reset':
      return { ...initialFeed, explainer: state.explainer }
    case 'turn_end':
      return state
  }
}
