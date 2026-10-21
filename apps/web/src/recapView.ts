import type { RecapEntry, RuleRecap } from '@sidecar/shared'

export interface RecapText {
  kicker: string
  headline: string
  /** Names of what was made or changed, at most MAX_PARTS, then how many more. */
  parts: Array<{ id: string; name: string; failed: boolean }>
  more: number
  packages: string | null
  checks: string
  /** Where the app is, without its scheme, for the OPEN YOUR APP button. */
  address: string | null
}

export const MAX_PARTS = 8

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * The request to copy into Claude Code while something still fails: the AI recap's, which knows the
 * whole turn, else the rule-based one naming the failed step. Null when nothing fails.
 */
export function recapAsk(ai: RecapEntry | undefined, ruleAsk: string | null): string | null {
  if (!ruleAsk) return null
  return (ai?.status === 'done' && ai.ai?.next) || ruleAsk
}

/** The recap card's words: plain sentences, no tool names. */
export function recapText(r: RuleRecap): RecapText {
  const kicker = r.state === 'you' ? 'CLAUDE NEEDS YOU' : r.state === 'working' ? 'SO FAR' : 'WHERE THINGS STAND'
  const headline = r.state === 'you'
    ? 'Claude is waiting for your answer in Claude Code.'
    : {
        working: 'Claude is working on it.',
        good: r.changed || r.built.length || r.packages ? 'Done.' : 'Done. Nothing was changed.',
        fixed: `Done, after fixing ${plural(r.fixes, 'problem')}.`,
        failing: 'Something still needs a fix.',
        stopped: 'Stopped before finishing.',
      }[r.outcome]
  return {
    kicker,
    headline,
    parts: r.built.slice(0, MAX_PARTS).map(({ id, name, failed }) => ({ id, name, failed })),
    more: Math.max(0, r.built.length - MAX_PARTS),
    packages: r.packages ? `Added ${plural(r.packages, 'building block')}` : null,
    checks: { pass: 'Checks pass', fail: 'Checks fail', none: 'No checks run yet' }[r.checks],
    address: r.url ? r.url.replace(/^https?:\/\//, '') : null,
  }
}

/**
 * Whether the pulled card for `cardId` shows its own "what to do next". The recap on screen (null when it is not,
 * as in a replay) already asks about its failed step, with the same words, so the card for that step leaves it out.
 */
export const cardAsks = (cardId: string, shownRecap: RuleRecap | null): boolean => shownRecap?.failingId !== cardId
