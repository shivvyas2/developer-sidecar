/** Text cut to at most `max` characters, its last one an ellipsis when it was longer; shorter text as it is. */
export const ellipsis = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)
