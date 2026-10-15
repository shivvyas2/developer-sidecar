/**
 * Terminal text model for the drafting-instrument language.
 *
 * Pure TypeScript: no DOM, no Node APIs. Widths are counted in code points
 * (`[...s].length`) and every character, box-drawing characters included, is
 * treated as exactly one column wide. Wide (CJK, emoji) and zero-width
 * characters are not measured specially.
 */
export type Tone = 'ink' | 'dim' | 'accent' | 'inverse' | 'bold'
export interface Seg { text: string; tone?: Tone }
export type Line = Seg[]

export interface TextStep {
  num: number
  title: string
  caption: string
  status: 'running' | 'ok' | 'failed' | 'interrupted'
  plain?: string
  why?: string
  chip?: string
}

export interface TextModel {
  project: string
  live: boolean
  offline?: boolean
  readout: { step: number; files: number; tokens: number; elapsed: string }
  /** Oldest first. */
  steps: TextStep[]
}

export const lineWidth = (l: Line): number => l.reduce((w, s) => w + [...s.text].length, 0)
