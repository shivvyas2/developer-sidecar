import { useRef, useState } from 'react'
import { UNDO_HINT } from './next'

/** A failed step's way forward: a request to copy into Claude Code, and Claude Code's own undo. */
export function NextStep({ ask }: { ask: string }) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'select'>('idle')
  const text = useRef<HTMLElement>(null)
  const copy = () => {
    const selectIt = () => {
      const range = document.createRange()
      if (text.current) range.selectNodeContents(text.current)
      getSelection()?.removeAllRanges()
      getSelection()?.addRange(range)
      setCopied('select')
    }
    if (!navigator.clipboard) return selectIt()
    navigator.clipboard.writeText(ask).then(() => setCopied('copied'), selectIt)
  }
  return (
    <div className="detail__next">
      <span className="ds-kicker">WHAT TO DO NEXT</span>
      <div className="detail__ask">
        <code ref={text}>{ask}</code>
        <button type="button" className="detail__copy" onClick={copy}>
          {copied === 'copied' ? 'COPIED' : copied === 'select' ? 'SELECTED, PRESS COPY' : 'COPY FOR CLAUDE'}
        </button>
      </div>
      <p className="detail__undo">{UNDO_HINT}</p>
    </div>
  )
}
