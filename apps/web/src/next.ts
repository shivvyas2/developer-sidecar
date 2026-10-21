import { ellipsis, isExplained, type FeedStep, type StepExplanation } from '@sidecar/shared'

const LABEL_CHARS = 80

/** Claude Code's own undo, taught where a step went wrong. */
export const UNDO_HINT = 'Or undo Claude’s last changes: press Esc twice in Claude Code, or type /rewind.'

/** What to ask Claude after a failed step: the explainer's suggestion, else a plain request naming the step. */
export function nextAsk(step: FeedStep, explanation: StepExplanation | undefined): string | null {
  if (step.status !== 'failed') return null
  if (isExplained(explanation) && explanation.next) return explanation.next
  const label = step.techLabel.replace(/\s+/g, ' ').trim()
  const what = ellipsis(label, LABEL_CHARS)
  return what ? `The last step failed (${what}). Find out why and fix it.` : 'The last step failed. Find out why and fix it.'
}
