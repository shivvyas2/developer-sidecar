/** Milestone toasts (spec §7): each at most once per step id, never for steps that were there when the mod loaded. */
import type { FeedStep } from '@sidecar/shared'
import { pad3, plain } from './model'

export interface ToastMemory {
  /** False until the first call, which only remembers what is already there. */
  seeded: boolean
  /** Step ids that already produced their toast. */
  seen: Set<string>
  /** Lowercased vendors already connected in this session. */
  vendors: Set<string>
}

export const freshMemory = (): ToastMemory => ({ seeded: false, seen: new Set(), vendors: new Set() })

/** The service label on a connect scene, cleaned for display. */
export function vendorOf(step: FeedStep): string | undefined {
  for (const c of step.scene?.cast ?? []) {
    if (typeof c === 'object' && c.place === 'service' && c.label) return plain(c.label) || undefined
  }
  return undefined
}

export function milestones(steps: readonly FeedStep[], mem: ToastMemory): string[] {
  const out: string[] = []
  let lastTestFailed = false
  steps.forEach((st, i) => {
    let toast: string | undefined
    if (st.category === 'test' && st.status === 'failed') toast = `✕ TESTS FAILED · ${pad3(i + 1)}`
    else if (st.category === 'test' && st.status === 'ok' && lastTestFailed) toast = `✓ TESTS PASSED · ${pad3(i + 1)}`
    else if (st.category === 'deploy' && st.status === 'ok') toast = '▲ DEPLOYED'
    else if (st.category === 'external' && st.status === 'ok' && !mem.seen.has(st.id)) {
      const vendor = vendorOf(st)
      if (vendor && !mem.vendors.has(vendor.toLowerCase())) {
        mem.vendors.add(vendor.toLowerCase())
        toast = `◆ CONNECTED · ${vendor.toUpperCase()}`
      }
    }
    if (st.category === 'test' && (st.status === 'ok' || st.status === 'failed')) lastTestFailed = st.status === 'failed'
    if (toast && !mem.seen.has(st.id)) {
      mem.seen.add(st.id)
      if (mem.seeded) out.push(toast)
    }
  })
  mem.seeded = true
  return out
}
