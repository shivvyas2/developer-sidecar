import { isRecord } from '../hook-payload'
import { basename, fileOf, str } from '../input'
import { segments } from '../shell'
import type { FeedStep } from '../step'
import type { GitInfo } from './baseline'

/**
 * "Set up GitHub safely": what the project already has, what is missing and why it matters, and a request the
 * person can paste into Claude Code for the rest. Sidecar never runs any of it itself.
 */

export type GuideId = 'repo' | 'gitignore' | 'readme' | 'remote' | 'pushed'
export interface GuideItem { id: GuideId; done: boolean; title: string; why: string }

type GuideStep = Pick<FeedStep, 'category' | 'status' | 'toolName' | 'input'>

/** Advice Sidecar cannot check, shown under the checklist. */
export const GUIDANCE: string[] = [
  'Keep the repository private unless you mean to share it.',
  'If it is public, add a license so people know how they may use it.',
  'Make bigger changes on a branch and merge them through a pull request.',
  'Protect the main branch so nothing lands there without a check.',
  'Commit often, with a short message that says what changed.',
  'Never paste keys into code. Keep them in environment variables.',
]

const ran = (steps: readonly GuideStep[], re: RegExp) => steps.some((s) =>
  s.status === 'ok' && s.toolName === 'Bash' && isRecord(s.input) && segments(str(s.input.command)).some((p) => re.test(p)))
const wrote = (steps: readonly GuideStep[], re: RegExp) => steps.some((s) =>
  s.status === 'ok' && (s.category === 'create' || s.category === 'edit') && isRecord(s.input) && re.test(basename(fileOf(s.input) ?? '')))

export function githubGuide(git: GitInfo | null, steps: readonly GuideStep[]): GuideItem[] {
  const onGitHub = git?.remote?.host === 'github.com'
  const otherHost = git?.remote && !onGitHub ? git.remote.host : null
  return [
    { id: 'repo', done: !!git?.repo || ran(steps, /\bgit\s+init\b/), title: 'The project is a git repository',
      why: 'Without it there are no snapshots to go back to when something breaks.' },
    { id: 'gitignore', done: !!git && git.ignoresSecrets && git.ignoresDeps, title: 'A .gitignore keeps secrets and clutter out',
      why: 'Secret keys pushed to GitHub can be copied by anyone who sees the repository, even after you delete them.' },
    { id: 'readme', done: !!git?.readme || wrote(steps, /^readme(\.|$)/i), title: 'A README says what the project is',
      why: 'Future you, and anyone you share it with, will need to know what it is and how to run it.' },
    { id: 'remote', done: onGitHub || ran(steps, /\bgh\s+repo\s+create\b/), title: 'There is a GitHub repository for it',
      why: otherHost ? `It is connected to ${otherHost}. GitHub is the suggested home, but any host keeps a copy off your computer.` : 'A copy on GitHub keeps your work safe if this computer is lost.' },
    { id: 'pushed', done: steps.some((s) => s.category === 'git' && s.status === 'ok' && s.toolName === 'Bash' && isRecord(s.input) && /\bgit\s+push\b/.test(str(s.input.command))),
      title: 'The work has been pushed', why: 'Commits only reach GitHub when they are pushed.' },
  ]
}

const ASK: Record<GuideId, string> = {
  repo: 'make it a git repository',
  gitignore: 'add a .gitignore that excludes .env files, node_modules and build output',
  readme: 'add a short README that says what the project is and how to run it',
  remote: 'create a private GitHub repository for it with the gh command',
  pushed: 'make a commit and push it',
}

/** A request to paste into Claude Code for whatever is missing, or null when nothing is. */
export function githubAsk(items: readonly GuideItem[]): string | null {
  const todo = items.filter((i) => !i.done).map((i) => ASK[i.id])
  if (!todo.length) return null
  const list = todo.length === 1 ? todo[0]! : `${todo.slice(0, -1).join(', ')}, and ${todo.at(-1)}`
  return `Set up GitHub for this project: ${list}. Never commit secret keys.`
}
