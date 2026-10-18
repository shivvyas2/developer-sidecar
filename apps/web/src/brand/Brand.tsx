import { useEffect, useState } from 'react'
import { INTRO_SEEN_KEY, MARK_INNER, MARK_VIEWBOX, MARK_VIEWBOX_TIGHT, shouldPlayIntro } from './mark'

interface MarkProps {
  /** Rendered width in CSS pixels; the height follows the drawing. */
  size: number
  /** Trim the empty sky and road, for a header or a banner. */
  tight?: boolean
  className?: string
  /** Leave out for a decorative mark next to the product name. */
  label?: string
}

/** The Sidecar mark, drawn inline so the workstation can theme and animate its parts. */
export function SidecarMark({ size, tight = false, className, label }: MarkProps) {
  const viewBox = tight ? MARK_VIEWBOX_TIGHT : MARK_VIEWBOX
  const [, , w, h] = viewBox.split(' ').map(Number)
  return (
    <svg
      className={['sc-logo', className].filter(Boolean).join(' ')}
      viewBox={viewBox}
      width={size}
      height={Math.round((size * h!) / w!)}
      shapeRendering="crispEdges"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      dangerouslySetInnerHTML={{ __html: MARK_INNER }}
    />
  )
}

/** sessionStorage, or null where touching it throws (sandboxed frames, blocked storage). */
function tabStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function introWanted(): boolean {
  const storage = tabStorage()
  let seen = false
  try { seen = storage?.getItem(INTRO_SEEN_KEY) === '1' } catch { /* storage blocked */ }
  return shouldPlayIntro({
    search: location.search,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    webdriver: navigator.webdriver === true,
    seen,
  })
}

/**
 * The cab drives across the page once when the workstation opens.
 * It never takes a click; any key or click sends it off early.
 */
export function Intro() {
  const [on, setOn] = useState(introWanted)
  useEffect(() => {
    if (!on) return
    try { tabStorage()?.setItem(INTRO_SEEN_KEY, '1') } catch { /* storage blocked */ }
    const skip = () => setOn(false)
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => {
      window.removeEventListener('keydown', skip)
      window.removeEventListener('pointerdown', skip)
    }
  }, [on])
  if (!on) return null
  return (
    <div className="intro" aria-hidden onAnimationEnd={(e) => { if (e.animationName === 'intro-drive') setOn(false) }}>
      <div className="intro__road" />
      <div className="intro__car">
        <SidecarMark size={260} tight className="sc-logo--driving" />
      </div>
      <p className="intro__word">DEVELOPER SIDECAR</p>
    </div>
  )
}
