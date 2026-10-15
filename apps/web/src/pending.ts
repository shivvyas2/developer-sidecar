import type { ExplainerState, FeedStep, StepExplanation } from '@sidecar/shared'

/**
 * True when the server will still explain this step, so "Explaining…" is honest: the explainer is ready,
 * the step finished (ok or failed), it isn't a prompt, it has no explanation yet, and it ended after the
 * explainer last became ready in this page (older steps may have been skipped while it was off or paused).
 */
export function isPendingExplanation(
  step: FeedStep, explanation: StepExplanation | undefined, explainer: ExplainerState | null, readySince: number,
): boolean {
  if (explainer?.status !== 'ready') return false
  if (step.status !== 'ok' && step.status !== 'failed') return false
  if (step.category === 'prompt' || explanation) return false
  return step.endedAt !== undefined && step.endedAt >= readySince
}
