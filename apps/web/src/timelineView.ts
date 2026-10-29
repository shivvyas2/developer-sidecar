import { isStopped, type Chapter, type ChapterOutcome, type FeedStep } from '@sidecar/shared'

/** The story along the bottom of the Stage: a band per thing you asked, a mark per step, coloured by how it went. */

export type MarkTone = 'ok' | 'failed' | 'fixed' | 'stopped' | 'running'
export interface TimelineChapter { id: string; asked: string; from: number; to: number; outcome: ChapterOutcome }
export interface TimelineMark { id: string; index: number; tone: MarkTone }

export function timelineOf(steps: readonly FeedStep[], chapters: readonly Chapter[]): { chapters: TimelineChapter[]; marks: TimelineMark[] } {
  const index = new Map(steps.map((s, i) => [s.id, i]))
  const fixes = new Set(chapters.flatMap((c) => c.beats.flatMap((b) => (b.type === 'step' && b.fixes ? [b.id] : []))))
  const bands = chapters.flatMap((c) => {
    const at = [c.id, ...c.stepIds].map((id) => index.get(id)).filter((i): i is number => i !== undefined)
    return at.length ? [{ id: c.id, asked: c.asked, from: Math.min(...at), to: Math.max(...at), outcome: c.outcome }] : []
  })
  const tone = (s: FeedStep): MarkTone =>
    s.status === 'running' ? 'running' : isStopped(s) ? 'stopped' : s.status === 'failed' ? 'failed' : fixes.has(s.id) ? 'fixed' : 'ok'
  return { chapters: bands, marks: steps.map((s, i) => ({ id: s.id, index: i, tone: tone(s) })) }
}
