export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p

/** Progress of `t` through [start, end], clamped to 0..1. */
export const progress = (t: number, start: number, end: number) =>
  end <= start ? (t >= start ? 1 : 0) : clamp((t - start) / (end - start))

export const easeInOut = (p: number) => {
  const x = clamp(p)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

export const easeOutBack = (p: number) => {
  const x = clamp(p)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
