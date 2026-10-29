import { useState } from 'react'
import { GUIDANCE, githubAsk, githubGuide, type FeedStep, type GitInfo } from '@sidecar/shared'

/** "Set up GitHub safely": what is done, what is missing and why, and a request to paste into Claude Code. */
export function GithubGuide({ git, steps }: { git: GitInfo | null; steps: FeedStep[] }) {
  const items = githubGuide(git, steps)
  const ask = githubAsk(items)
  const [copied, setCopied] = useState(false)
  const copy = () => { if (ask) navigator.clipboard?.writeText(ask).then(() => setCopied(true)).catch(() => undefined) }
  return (
    <section className="ghguide" aria-label="Set up GitHub safely">
      <h3 className="concept__h">Set up GitHub safely</h3>
      <ul className="ghguide__list">
        {items.map((i) => (
          <li key={i.id} data-done={i.done}>
            <span className="ghguide__mark" aria-hidden>{i.done ? '✓' : '·'}</span>
            <span><b>{i.title}</b><span className="ghguide__why">{i.why}</span></span>
            <span className="sr-only">{i.done ? 'done' : 'not done yet'}</span>
          </li>
        ))}
      </ul>
      {ask ? (
        <div className="ghguide__ask">
          <p>Paste this into Claude Code to set up the rest:</p>
          <blockquote>{ask}</blockquote>
          <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy request'}</button>
        </div>
      ) : <p className="ghguide__done">All set. Your work is backed up on GitHub.</p>}
      <h3 className="concept__h">Good habits</h3>
      <ul className="ghguide__habits">{GUIDANCE.map((g) => <li key={g}>{g}</li>)}</ul>
    </section>
  )
}
