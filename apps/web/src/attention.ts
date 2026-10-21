import type { SessionSummary } from '@sidecar/shared'
import { needsYou as attentionNeedsYou } from '@sidecar/ui-kit'

export const TITLE = 'Developer Sidecar'

/** The same test the status light uses, so the strip, the tag and the light agree. */
const needsYou = (s: SessionSummary | null | undefined) => attentionNeedsYou(s?.attention)

/** The banner for a session that is waiting on its person, in plain words, or null. */
export function attentionNotice(s: SessionSummary | null): { tag: string; text: string } | null {
  if (s?.attention === 'permission') {
    const what = s.attentionText ? `${s.attentionText.replace(/[.\s]+$/, '')}. ` : 'Claude is waiting for your permission. '
    return { tag: 'NEEDS YOU', text: `${what}Answer in your Claude Code window.` }
  }
  if (s?.attention === 'idle') return { tag: 'YOUR TURN', text: 'Claude finished and is waiting for your next message.' }
  return null
}

/** The stage's tag while following the newest step: what the session needs, or that its turn is done. */
export function liveTag(s: SessionSummary | null, offline: boolean): string | undefined {
  if (offline) return 'OFFLINE'
  if (needsYou(s)) return 'NEEDS YOU'
  if (s?.attention === 'done') return 'DONE'
  return undefined
}

/** The tab title, marked while any session is waiting, so a background tab still says so. */
export const titleFor = (sessions: readonly SessionSummary[]): string =>
  sessions.some(needsYou) ? `(waiting) ${TITLE}` : TITLE

/** A short mark for the session picker. */
export const sessionMark = (s: SessionSummary): string => (needsYou(s) ? ' · NEEDS YOU' : '')
