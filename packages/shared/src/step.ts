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

/**
 * A step the person cancelled, such as a dev server stopped with Ctrl-C: interrupted, or reported by the hook as a
 * failure with `interrupted: true` in its output. Nothing went wrong, so it says nothing about how things stand.
 */
export const isStopped = (s: Pick<Step, 'status'> & { output?: unknown }): boolean =>
  s.status === 'interrupted' || (typeof s.output === 'object' && s.output !== null && (s.output as { interrupted?: unknown }).interrupted === true)

export type Checks = 'pass' | 'fail' | 'none'

/** How the last check run that finished went, or none when Claude hasn't run any. A run that was cut short says nothing. */
export function checksOf(steps: readonly (Pick<Step, 'status'> & { category: Category; output?: unknown })[]): Checks {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]!
    if (s.category === 'test' && (s.status === 'ok' || s.status === 'failed') && !isStopped(s)) return s.status === 'ok' ? 'pass' : 'fail'
  }
  return 'none'
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
