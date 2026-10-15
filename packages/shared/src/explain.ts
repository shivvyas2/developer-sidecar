import { z } from 'zod'

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
