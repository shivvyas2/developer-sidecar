/** SIDECAR_PORT pins the first port the server tries (tests and smoke use it to stay off a live sidecar's port). */
export function portFromEnv(env: Record<string, string | undefined>): number | undefined {
  const raw = env.SIDECAR_PORT
  if (!raw || !/^\d+$/.test(raw)) return undefined
  const port = Number(raw)
  return port >= 1024 && port <= 65535 ? port : undefined
}
