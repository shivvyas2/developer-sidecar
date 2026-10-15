/** The desktop pane's stage: the latest step's scene, framed, with the theme embedded. */
import { SceneSpecSchema, type FeedStep } from '@sidecar/shared'
import { compile, render, themeCss, townFrom, type Readout } from '@sidecar/ui-kit'
import { forStatus } from '@sidecar/ui-kit/catalog'

/** The engine refuses an Svg whose source is longer than this. */
export const SVG_LIMIT = 131_072

/** Put the theme's CSS inside the SVG: an Svg element has no page stylesheet to inherit. */
export const themed = (svg: string): string => svg.replace(/^<svg([^>]*)>/, `<svg$1><style>${themeCss()}</style>`)

/** `remainingMs` is how much of the scene is left to play; 0 once it holds still. */
export function paneScene(steps: readonly FeedStep[], readout: Readout, sinceMs: number): { svg: string; playing: boolean; remainingMs: number } | undefined {
  const last = steps.at(-1)
  if (!last) return undefined
  try {
    const parsed = SceneSpecSchema.safeParse(forStatus(last.scene, last.status))
    if (!parsed.success) return undefined
    const timeline = compile(parsed.data)
    const t = Math.min(Math.max(0, sinceMs), timeline.duration)
    const svg = themed(render(parsed.data, t, { frame: true, readout, timeline, town: townFrom(steps.filter((st) => SceneSpecSchema.safeParse(st.scene).success)) }))
    const remainingMs = Math.max(0, timeline.duration - Math.max(0, sinceMs))
    return svg.length < SVG_LIMIT ? { svg, playing: remainingMs > 0, remainingMs } : undefined
  } catch {
    return undefined
  }
}
