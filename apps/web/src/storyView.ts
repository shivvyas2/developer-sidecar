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


const SEARCHES = new Set(['Grep', 'Glob'])
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

/**
 * A folded beat's title in plain words: "Read 3 files, searched twice", "Changed route.ts 3 times". Read counts
 * files, Grep and Glob are searches, and any other look (`git status`, `cat`, `ls`) is looking around.
 */
export function beatTitle(b: Exclude<StoryBeat, { type: 'step' }>, byId: ReadonlyMap<string, Seen>): string {
  if (b.type === 'edits') return `Changed ${basename(b.file)} ${b.ids.length} times`
  const tools = b.ids.map((id) => byId.get(id)?.toolName)
  const reads = b.ids.filter((_, i) => tools[i] === 'Read')
  const files = new Set(reads.map((id) => fileOf(byId.get(id)?.input))).size
  const searches = tools.filter((t) => t && SEARCHES.has(t)).length
  const looks = b.ids.length - reads.length - searches
  const parts = [files ? `read ${plural(files, 'file')}` : '', searches ? `searched ${times(searches)}` : '', looks ? `looked around ${times(looks)}` : '']
  const text = parts.filter(Boolean).join(', ')
  return text ? text[0]!.toUpperCase() + text.slice(1) : 'Looked around'
}

export type DrawerRow = { type: 'phase'; key: string; title: string } | { type: 'beat'; key: string; beat: StoryBeat }

/** A beat's key in the drawer: its chapter and its first step, which stay put as the beat grows. */
export const beatKey = (chapterId: string, b: StoryBeat): string => `${chapterId}:${beatIds(b)[0]}`

/**
 * A chapter's beats newest first, as the drawer stacks them, with a phase title above each run of
 * beats in the same phase ("Checking", "Building", ...). A title is keyed by the first beat of its
 * run, so titles keep their keys as beats arrive live.
 */
export function drawerRows(c: Pick<Chapter, 'id' | 'beats'>): DrawerRow[] {
  const rows: DrawerRow[] = []
  // walk oldest first so each run knows its first beat, then stack the rows newest first
  let runStart = ''
  c.beats.forEach((b, i) => {
    if (i === 0 || c.beats[i - 1]!.phase !== b.phase) runStart = beatKey(c.id, b)
    rows.push({ type: 'beat', key: beatKey(c.id, b), beat: b })
    // the run's newest beat: its title goes above it once the rows are stacked newest first
    if (i === c.beats.length - 1 || c.beats[i + 1]!.phase !== b.phase) rows.push({ type: 'phase', key: `${runStart}:phase`, title: PHASE_TITLE[b.phase] })
  })
  return rows.reverse()
}

/** The key of the folded beat holding this step, so selecting a step inside one opens it. */
export function foldedBeatOf(chapters: readonly Chapter[], stepId: string | null): string | null {
  if (!stepId) return null
  for (const c of chapters) {
    for (const b of c.beats) if (b.type !== 'step' && b.ids.includes(stepId)) return beatKey(c.id, b)
  }
  return null
}
