/** Most scenes allowed to wait. A burst skips older scenes so the stage stays near live. */
export const MAX_BACKLOG = 3

export interface StageState {
  current: string | null
  queue: string[]
  known: ReadonlySet<string>
  playing: boolean
}

export type StageAction =
  | { type: 'reset'; ids: string[] }
  | { type: 'sync'; ids: string[] }
  | { type: 'done' }

export const initialStage: StageState = { current: null, queue: [], known: new Set(), playing: false }

export function stageReducer(s: StageState, a: StageAction): StageState {
  switch (a.type) {
    case 'reset':
      return { current: a.ids.at(-1) ?? null, queue: [], known: new Set(a.ids), playing: false }
    case 'sync': {
      const fresh = a.ids.filter((id) => !s.known.has(id))
      if (fresh.length === 0) return s
      const known = new Set([...s.known, ...fresh])
      if (!s.playing) {
        const [next, ...rest] = fresh
        return { current: next!, queue: rest.slice(-MAX_BACKLOG), known, playing: true }
      }
      return { ...s, queue: [...s.queue, ...fresh].slice(-MAX_BACKLOG), known }
    }
    case 'done': {
      const [next, ...rest] = s.queue
      return next ? { ...s, current: next, queue: rest, playing: true } : { ...s, playing: false }
    }
  }
}

export interface Replay { index: number; playing: boolean }

export const replayAdvance = (r: Replay, length: number): Replay =>
  r.index < length - 1 ? { ...r, index: r.index + 1 } : { ...r, playing: false }
