/** Token counts as the readout and the terminal show them: 950, 4.3k, 12k, 2.5M. Non-finite or negative reads 0. */
export const fmtTokens = (v: number): string => {
  const x = Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0
  const short = (d: number, unit: string) => `${(x / d).toFixed(1).replace(/\.0$/, '')}${unit}`
  if (x < 1000) return String(x)
  if (x < 999_950) return short(1000, 'k')
  return short(1_000_000, 'M')
}
