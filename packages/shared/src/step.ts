import type { DecisionEntry, ExplainerState, GlossaryEntry, StepExplanation } from './explain'
import type { SceneSpec } from './scene'

export type StepStatus = 'running' | 'ok' | 'failed' | 'interrupted'

export interface Step {
  id: string
  sessionId: string
  toolName: string
  input: unknown
  output?: unknown
  startedAt: number
  endedAt?: number
  status: StepStatus
}

export type Category =
  | 'read' | 'create' | 'edit' | 'install' | 'test' | 'run' | 'external'
  | 'mcp' | 'git' | 'data' | 'deploy' | 'subagent' | 'prompt' | 'fallback'

export interface Translation {
  category: Category
  caption: string
  techLabel: string
  scene: SceneSpec
}

export type FeedStep = Step & Translation & { seq: number; explanation?: StepExplanation }

/** What the session needs from its person: nothing (working), an answer (permission, idle), or its turn is over (done). */
export type Attention = 'working' | 'permission' | 'idle' | 'done'

export interface SessionSummary {
  id: string
  cwd: string
  startedAt: number
  lastAt: number
  attention?: Attention
  attentionAt?: number
  /** Claude Code's own words for a permission or idle notice, scrubbed and clipped. */
  attentionText?: string
}

export type ServerMessage =
  | { type: 'step'; step: FeedStep }
  | { type: 'session'; session: SessionSummary }
  | { type: 'explanation'; sessionId: string; stepId: string; explanation: StepExplanation }
  | { type: 'decision'; decision: DecisionEntry }
  | { type: 'concept'; concept: GlossaryEntry }
  | { type: 'explainer'; state: ExplainerState }
  | { type: 'session_deleted'; id: string }
  | { type: 'reset' }
