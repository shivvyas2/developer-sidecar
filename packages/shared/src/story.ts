import { isRecord } from './hook-payload'
import type { Category, FeedStep } from './step'

/**
 * A session told as a story: one chapter per thing you asked, its steps grouped into beats. Runs of
 * reading fold into one beat, repeat changes to one file into another, and a check run that passes
 * after a failed one is marked as the fix. Built from steps alone, with no model.
 */

export type StoryPhase = 'looking' | 'building' | 'checking' | 'saving' | 'other'

export type StoryBeat =
  /** One step. A passing check run that follows a failed one `fixes` it; the failed run is `fixedBy` the pass. */
  | { type: 'step'; id: string; phase: StoryPhase; fixes?: string; fixedBy?: string }
  /** Two or more reads or searches in a row. */
  | { type: 'looked'; ids: string[]; phase: 'looking' }
  /** Two or more changes in a row to the same file. */
  | { type: 'edits'; ids: string[]; file: string; phase: 'building' }

/** working: Claude is still at it. good: done, nothing broken. fixed: done, after fixing a problem. failing: something is still broken. stopped: cut short. */
export type ChapterOutcome = 'working' | 'good' | 'fixed' | 'failing' | 'stopped'

export interface Chapter {
  /** The prompt step's id, or the first step's when the session began before Sidecar saw a prompt. */
  id: string
  promptId: string | null
  /** What you asked, or empty before the first prompt. */
  asked: string
  /** Every step in the chapter but the prompt, in order. */
  stepIds: string[]
  beats: StoryBeat[]
  /** Check runs that passed after failing. */
  fixes: number
  outcome: ChapterOutcome
}

export type StoryStep = Pick<FeedStep, 'id' | 'category' | 'status' | 'toolName' | 'input'>

const PHASE: Record<Category, StoryPhase> = {
  read: 'looking',
  create: 'building', edit: 'building', install: 'building', data: 'building', external: 'building', mcp: 'building',
  test: 'checking', run: 'checking',
  git: 'saving', deploy: 'saving',
  prompt: 'other', subagent: 'other', fallback: 'other',
}
export const phaseOf = (category: Category): StoryPhase => PHASE[category] ?? 'other'

export const PHASE_TITLE: Record<StoryPhase, string> = {
  looking: 'Looking around', building: 'Building', checking: 'Checking', saving: 'Saving', other: 'Working',
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const inputOf = (s: StoryStep) => (isRecord(s.input) ? s.input : {})
const fileOf = (s: StoryStep) => str(inputOf(s).file_path) || str(inputOf(s).notebook_path)
const commandOf = (s: StoryStep) => str(inputOf(s).command).trim().replace(/\s+/g, ' ')
const finished = (s: StoryStep) => s.status === 'ok' || s.status === 'failed'
const EDITS = new Set(['Edit', 'MultiEdit', 'NotebookEdit'])

/** A passing run covers a failed one when it runs the same checks or more of them (`vitest run` covers `vitest run a.test.ts`). */
const covers = (pass: string, failed: string) => failed === pass || failed.startsWith(`${pass} `)

const isLook = (s: StoryStep) => s.category === 'read' && s.status === 'ok'
const isEdit = (s: StoryStep) => EDITS.has(s.toolName) && s.status === 'ok' && fileOf(s) !== ''

function beatsOf(steps: readonly StoryStep[]): { beats: StoryBeat[]; fixes: number; broken: number } {
  const beats: StoryBeat[] = []
  const unresolved: Array<{ beat: Extract<StoryBeat, { type: 'step' }>; command: string }> = []
  let fixes = 0
  let prev: StoryStep | undefined
  for (const s of steps) {
    const last = beats.at(-1)
    // the last beat is still a single step when it's the step just before this one
    const single = last?.type === 'step' && prev?.id === last.id ? prev : undefined
    prev = s
    if (isLook(s)) {
      if (last?.type === 'looked') { last.ids.push(s.id); continue }
      if (single && isLook(single)) { beats[beats.length - 1] = { type: 'looked', ids: [single.id, s.id], phase: 'looking' }; continue }
    }
    if (isEdit(s)) {
      if (last?.type === 'edits' && last.file === fileOf(s)) { last.ids.push(s.id); continue }
      if (single && isEdit(single) && fileOf(single) === fileOf(s)) {
        beats[beats.length - 1] = { type: 'edits', ids: [single.id, s.id], file: fileOf(s), phase: 'building' }
        continue
      }
    }
    const beat: Extract<StoryBeat, { type: 'step' }> = { type: 'step', id: s.id, phase: phaseOf(s.category) }
    if (s.category === 'test' && finished(s)) {
      const command = commandOf(s)
      if (s.status === 'failed') unresolved.push({ beat, command })
      else {
        const fixed = unresolved.filter((u) => covers(command, u.command))
        if (fixed.length) {
          fixes++
          beat.fixes = fixed.at(-1)!.beat.id
          for (const u of fixed) { u.beat.fixedBy = s.id; unresolved.splice(unresolved.indexOf(u), 1) }
        }
      }
    }
    beats.push(beat)
  }
  return { beats, fixes, broken: unresolved.length }
}

/** `broken` counts failed check runs that no later run covered. */
function outcomeOf(steps: readonly StoryStep[], fixes: number, broken: number, open: boolean): ChapterOutcome {
  if (open || steps.some((s) => s.status === 'running')) return 'working'
  if (broken > 0) return 'failing'
  // the last step that changed something decides; reads and prompts say nothing
  const lastChange = [...steps].reverse().find((s) => finished(s) && s.category !== 'read')
  if (lastChange?.status === 'failed') return 'failing'
  if (steps.at(-1)?.status === 'interrupted') return 'stopped'
  return fixes > 0 ? 'fixed' : 'good'
}

const askedOf = (s: StoryStep | null) => (s ? str(inputOf(s).prompt).trim() : '')

/**
 * The story of a session. `open` says Claude is still working on the last thing you asked (the
 * session's attention is working), so its chapter reads working even between steps.
 */
export function storyOf(steps: readonly StoryStep[], open = false): Chapter[] {
  const groups: Array<{ prompt: StoryStep | null; steps: StoryStep[] }> = []
  for (const s of steps) {
    if (s.category === 'prompt') groups.push({ prompt: s, steps: [] })
    else if (groups.length) groups.at(-1)!.steps.push(s)
    else groups.push({ prompt: null, steps: [s] })
  }
  return groups.map((g, i) => {
    const { beats, fixes, broken } = beatsOf(g.steps)
    return {
      id: g.prompt?.id ?? g.steps[0]!.id,
      promptId: g.prompt?.id ?? null,
      asked: askedOf(g.prompt),
      stepIds: g.steps.map((s) => s.id),
      beats,
      fixes,
      outcome: outcomeOf(g.steps, fixes, broken, open && i === groups.length - 1),
    }
  })
}

/** The ids a beat stands for, in order. */
export const beatIds = (b: StoryBeat): string[] => (b.type === 'step' ? [b.id] : b.ids)
