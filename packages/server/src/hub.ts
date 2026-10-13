import type { ServerMessage } from '@sidecar/shared'

export class Hub {
  private subs = new Set<(m: ServerMessage) => void>()

  subscribe(fn: (m: ServerMessage) => void): () => void {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }

  publish(m: ServerMessage): void {
    for (const fn of this.subs) {
      try {
        fn(m)
      } catch {
        // one bad subscriber must not break the others
      }
    }
  }

  get size(): number {
    return this.subs.size
  }
}
