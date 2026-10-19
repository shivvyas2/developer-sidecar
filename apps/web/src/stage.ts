/**
 * Most scenes allowed to wait. A scene runs about 3 to 4 seconds, so a longer line put the stage
 * several steps behind what Claude was doing while it still read LIVE. With one, a burst plays the
 * scene on screen and then the newest step.
 */
export const MAX_BACKLOG = 1

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
  /** Claude stopped (done, or waiting on you): show the newest step now, whatever was queued. */
  | { type: 'catchUp'; ids: string[] }

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
    case 'catchUp': {
      const last = a.ids.at(-1)
      if (!last || (s.current === last && s.queue.length === 0)) return s
      const known = new Set([...s.known, ...a.ids])
      return s.current === last ? { ...s, queue: [], known } : { current: last, queue: [], known, playing: true }
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
