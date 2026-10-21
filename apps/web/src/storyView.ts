import { basename, beatIds, fileOf, PHASE_TITLE, type Chapter, type ChapterOutcome, type FeedStep, type StoryBeat } from '@sidecar/shared'

type Seen = Pick<FeedStep, 'id' | 'toolName' | 'input'>

export const OUTCOME_TEXT: Record<ChapterOutcome, string> = {
  working: 'working on it', good: 'done', fixed: 'done, after a fix', failing: 'needs a fix', stopped: 'stopped early',
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The line under a chapter's prompt: how many steps, any fixes, and how it ended. */
export function chapterLine(c: Pick<Chapter, 'stepIds' | 'fixes' | 'outcome'>): string {
  const fixes = c.fixes > 0 ? ` · fixed ${plural(c.fixes, 'problem')}` : ''
  return `${plural(c.stepIds.length, 'step')}${fixes} · ${OUTCOME_TEXT[c.outcome]}`
}


/** A folded beat's title in plain words: "Read 3 files, searched twice", "Changed route.ts 3 times". */
export function beatTitle(b: Exclude<StoryBeat, { type: 'step' }>, byId: ReadonlyMap<string, Seen>): string {
  if (b.type === 'edits') return `Changed ${basename(b.file)} ${b.ids.length} times`
  const reads = b.ids.filter((id) => byId.get(id)?.toolName === 'Read')
  const files = new Set(reads.map((id) => fileOf(byId.get(id)?.input))).size
  const searches = b.ids.length - reads.length
  const parts = [files ? `read ${plural(files, 'file')}` : '', searches ? `searched ${searches === 1 ? 'once' : searches === 2 ? 'twice' : `${searches} times`}` : '']
  const text = parts.filter(Boolean).join(', ')
  return text ? text[0]!.toUpperCase() + text.slice(1) : 'Looked around'
}

export type DrawerRow = { type: 'phase'; key: string; title: string } | { type: 'beat'; key: string; beat: StoryBeat }

/**
 * A chapter's beats newest first, as the drawer stacks them, with a phase title above each run of
 * beats in the same phase ("Checking", "Building", ...).
 */
export function drawerRows(c: Pick<Chapter, 'id' | 'beats'>): DrawerRow[] {
  const rows: DrawerRow[] = []
  const beats = [...c.beats].reverse()
  beats.forEach((b, i) => {
    if (i === 0 || beats[i - 1]!.phase !== b.phase) rows.push({ type: 'phase', key: `${c.id}:phase:${i}`, title: PHASE_TITLE[b.phase] })
    rows.push({ type: 'beat', key: `${c.id}:${beatIds(b)[0]}`, beat: b })
  })
  return rows
}

/** The key of the folded beat holding this step, so selecting a step inside one opens it. */
export function foldedBeatOf(chapters: readonly Chapter[], stepId: string | null): string | null {
  if (!stepId) return null
  for (const c of chapters) {
    for (const b of c.beats) if (b.type !== 'step' && b.ids.includes(stepId)) return `${c.id}:${b.ids[0]}`
  }
  return null
}
