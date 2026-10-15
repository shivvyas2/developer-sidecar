/** When the mod polls the server (spec §7, §8). The engine's clock ticks every FAST_MS; `due` skips ticks to back off. */
export const FAST_MS = 1000
export const SLOW_MS = 5000
export const QUIET_MS = 60_000

export interface Cadence { lastPoll: number; lastChange: number; offline: boolean }

export const newCadence = (now: number): Cadence => ({ lastPoll: -Infinity, lastChange: now, offline: false })

export const interval = (c: Cadence, now: number): number =>
  c.offline || now - c.lastChange >= QUIET_MS ? SLOW_MS : FAST_MS

export const due = (c: Cadence, now: number): boolean => now - c.lastPoll >= interval(c, now)

export function recordPoll(c: Cadence, now: number, outcome: 'changed' | 'same' | 'offline'): Cadence {
  if (outcome === 'offline') return { ...c, lastPoll: now, offline: true }
  return { lastPoll: now, lastChange: outcome === 'changed' ? now : c.lastChange, offline: false }
}
