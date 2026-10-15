import { readPort, readToken } from '@sidecar/shared/home'

/** Where the mod finds the server: the same home, port file and token the hooks use. */
export function locate(home: string): { port: number; token: string | null } {
  return { port: readPort(home), token: readToken(home) }
}
