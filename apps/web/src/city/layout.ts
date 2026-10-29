import type { BuildingKind, CityTown } from '@sidecar/shared'

/**
 * Where each building stands on the island. Shops line the main street, the office, warehouse and workshops
 * sit behind them, outside services across the road, and the yard, vault, inspector, archive and site office
 * along the back. A building keeps its plot as the town grows: slots fill in the order buildings appear.
 */

export interface Plot { x: number; z: number; w: number; d: number; ry: number }

export const ISLAND_HALF = 50
/** The main road runs along x at this z; its asphalt and sidewalks reach ROAD_HALF either side. */
export const ROAD_Z = 8
export const ROAD_HALF = 3.6

const SIZE: Record<BuildingKind, [number, number]> = {
  shop: [6, 5], office: [7, 5.5], workshop: [4.5, 4], warehouse: [7, 6], service: [6, 5],
  vault: [2.6, 2.2], yard: [5, 4], inspector: [3.2, 3], archive: [5, 4], siteOffice: [3.4, 2.6],
}

const PITCH = 7.5
const SLOTS = 10
/** Slot 0 in the middle, then right, left, further right, further left. */
const slotX = (i: number, pitch = PITCH) => (i % 2 ? 1 : -1) * Math.ceil(i / 2) * pitch

const SHOP_ROWS = [0, -26, 28, 37]
const BACK_ROW = -9
const SERVICE_ROW = 19
const SERVICE_PITCH = 9
const SERVICE_SLOTS = 8
const FIXED_ROW = -17.5
const FIXED: BuildingKind[] = ['siteOffice', 'yard', 'vault', 'inspector', 'archive']

export function plotTown(town: CityTown): Map<string, Plot> {
  const plots = new Map<string, Plot>()
  const put = (id: string, kind: BuildingKind, x: number, z: number) => {
    const [w, d] = SIZE[kind]
    plots.set(id, { x, z, w, d, ry: 0 })
  }
  let shops = 0, workshops = 0, services = 0
  for (const b of town.buildings) {
    switch (b.kind) {
      case 'shop': {
        const row = Math.floor(shops / SLOTS)
        if (row < SHOP_ROWS.length) put(b.id, 'shop', slotX(shops % SLOTS), SHOP_ROWS[row]!)
        shops++
        break
      }
      case 'office': put(b.id, 'office', slotX(0), BACK_ROW); break
      case 'warehouse': put(b.id, 'warehouse', slotX(1), BACK_ROW); break
      case 'workshop': {
        // the back row's free slots first, then the fixed row's
        if (workshops < SLOTS - 2) put(b.id, 'workshop', slotX(workshops + 2), BACK_ROW)
        else if (workshops < SLOTS - 2 + SLOTS - FIXED.length) put(b.id, 'workshop', slotX(workshops - (SLOTS - 2) + FIXED.length), FIXED_ROW)
        workshops++
        break
      }
      case 'service': {
        if (services < SERVICE_SLOTS) put(b.id, 'service', slotX(services, SERVICE_PITCH), SERVICE_ROW)
        services++
        break
      }
      default: put(b.id, b.kind, slotX(FIXED.indexOf(b.kind)), FIXED_ROW)
    }
  }
  return plots
}
