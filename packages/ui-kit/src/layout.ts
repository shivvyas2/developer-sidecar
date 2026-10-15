import { ActorIdSchema, PlaceIdSchema, type ActorId, type PlaceId } from '@sidecar/shared'

export interface Point { x: number; y: number }

/** The scene canvas. Slots for the sheet live in scene/layout.ts. */
export const VIEW = { w: 640, h: 360 } as const

const PLACES = new Set<string>(PlaceIdSchema.options)
const ACTORS = new Set<string>(ActorIdSchema.options)
export const isPlace = (s: string): s is PlaceId => PLACES.has(s)
export const isActor = (s: string): s is ActorId => ACTORS.has(s)
