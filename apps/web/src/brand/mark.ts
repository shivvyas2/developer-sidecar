/**
 * The Sidecar mark (a pixel robot driving a cab) and the rules for the drive-in intro.
 * sidecar.svg is the one source: the favicon and the README use the file, the workstation
 * draws its inside inline so the sc-* parts can be animated and themed.
 */
import raw from './sidecar.svg?raw'

/** The whole 128 x 128 grid, for square uses like the favicon. */
export const MARK_VIEWBOX = '0 0 128 128'
/** Just the cab and its driver, with the empty sky and road trimmed off. */
export const MARK_VIEWBOX_TIGHT = '0 26 128 86'

/**
 * The drawing inside the outer <svg>, without its <title> or <style>: an inline <style>
 * would apply to the whole page, and the caller names the image itself.
 */
export function markInner(svg: string): string {
  return svg
    .replace(/^[\s\S]*?<svg\b[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>[\s\S]*?<\/title>/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
}

export const MARK_INNER = markInner(raw)

export const INTRO_SEEN_KEY = 'sidecar.intro.seen'

export interface IntroContext {
  search: string
  reducedMotion: boolean
  /** True under browser automation, so tests never wait on the intro. */
  webdriver: boolean
  /** Whether this tab has already played it. */
  seen: boolean
}

/**
 * Once per tab, never for reduced motion or automation.
 * ?intro=1 always plays it and ?intro=0 never does.
 */
export function shouldPlayIntro(c: IntroContext): boolean {
  const forced = new URLSearchParams(c.search).get('intro')
  if (forced === '1') return true
  if (forced === '0') return false
  return !c.reducedMotion && !c.webdriver && !c.seen
}
