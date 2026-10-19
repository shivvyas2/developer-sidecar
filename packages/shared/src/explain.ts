import { z } from 'zod'
import { isRecord } from './hook-payload'
import type { Category, Step } from './step'

export const ConceptSchema = z.object({ term: z.string().min(1), definition: z.string().min(1) })
export const DecisionSchema = z.object({
  title: z.string().min(1),
  choice: z.string().min(1),
  alternatives: z.array(z.string().min(1)),
  reason: z.string().min(1),
})
export const ExplanationSchema = z.object({
  plain: z.string().min(1),
  why: z.string().min(1),
  concept: ConceptSchema.nullable(),
  decision: DecisionSchema.nullable(),
  /** For a failed step: one thing the person could ask Claude next. Absent on older explanations. */
  next: z.string().min(1).optional(),
})
export type Concept = z.infer<typeof ConceptSchema>
export type Decision = z.infer<typeof DecisionSchema>
export type Explanation = z.infer<typeof ExplanationSchema>

/** Either an explanation, or the reason there isn't one. */
export type StepExplanation = Explanation | { unavailable: string }
export const isExplained = (e: StepExplanation | undefined): e is Explanation => !!e && !('unavailable' in e)

export const ExplainLevelSchema = z.enum(['off', 'haiku', 'sonnet'])
export type ExplainLevel = z.infer<typeof ExplainLevelSchema>
export const SettingsSchema = z.object({ explanations: ExplainLevelSchema })
export type Settings = z.infer<typeof SettingsSchema>
export const DEFAULT_SETTINGS: Settings = { explanations: 'haiku' }

export interface TokenUsage { input: number; output: number }

export interface ExplainerState {
  level: ExplainLevel
  provider: 'api' | 'cli' | null
  status: 'off' | 'ready' | 'paused' | 'unavailable'
  reason?: string
  tokens: TokenUsage
}

export type DecisionEntry = Decision & { id: string; sessionId: string; stepId: string; at: number }
export type GlossaryEntry = Concept & { sessionId: string; stepId: string; at: number }

/** The tools that write a file, and the input field naming it. */
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
type Routinable = Pick<Step, 'id' | 'toolName' | 'input' | 'status'> & { category: Category }

/** The file a step wrote, if it is a write or edit tool. */
export function writtenFile(step: Pick<Step, 'toolName' | 'input'>): string | undefined {
  if (!WRITERS.has(step.toolName) || !isRecord(step.input)) return undefined
  const file = step.input.file_path ?? step.input.notebook_path
  return typeof file === 'string' && file ? file : undefined
}

/**
 * A finished step whose caption already says enough, so it is not sent to the explainer: a successful
 * read, or a successful edit to a file already written since the last prompt (`touched`). Failures are
 * always explained: what went wrong is the most useful thing to explain.
 */
export function isRoutine(step: Routinable, touched: ReadonlySet<string>): boolean {
  if (step.status !== 'ok') return false
  if (step.category === 'read') return true
  const file = step.category === 'edit' ? writtenFile(step) : undefined
  return file !== undefined && touched.has(file)
}

/** Adds the step to the files-written-since-the-last-prompt set; a prompt starts a new set. */
export function trackTouched(touched: Set<string>, step: Routinable): void {
  if (step.category === 'prompt') { touched.clear(); return }
  const file = step.status === 'ok' ? writtenFile(step) : undefined
  if (file) touched.add(file)
}

/** Ids of the routine steps in a session's steps, in order. */
export function routineIds(steps: readonly Routinable[]): Set<string> {
  const touched = new Set<string>()
  const out = new Set<string>()
  for (const s of steps) {
    if (isRoutine(s, touched)) out.add(s.id)
    trackTouched(touched, s)
  }
  return out
}
