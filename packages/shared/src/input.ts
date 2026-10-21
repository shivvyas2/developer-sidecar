// Reading a tool's input: shared by the story, the project map and the web app.

import { isRecord } from './hook-payload'

/** The value when it is a string, else empty text. */
export const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** The last part of a path, split on either slash: `/p/app/page.tsx` and `C:\shop\page.tsx` both give `page.tsx`. */
export const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p

/** The file a tool input names: `file_path`, or a notebook's `notebook_path`; empty when it names none. */
export function fileOf(input: unknown): string {
  return isRecord(input) ? str(input.file_path) || str(input.notebook_path) : ''
}
