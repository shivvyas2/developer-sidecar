import { ActorIdSchema, PlaceIdSchema, type ActorId, type PlaceId } from '@sidecar/shared'

export interface Point { x: number; y: number }

export const VIEW = { w: 640, h: 360 } as const
/** Buildings stand on this line. */
export const GROUND_Y = 300
/** Characters walk along this line, in front of the buildings. */
export const LANE_Y = 334
export const APP_FLOOR_H = 30

export const PLACE_AT: Record<PlaceId, Point> = {
  bookshelf: { x: 64, y: GROUND_Y },
  toolbox: { x: 160, y: GROUND_Y },
  app: { x: 315, y: GROUND_Y },
  database: { x: 445, y: GROUND_Y },
  service: { x: 565, y: GROUND_Y },
  browser: { x: 150, y: 120 },
  cloud: { x: 520, y: 92 },
}

export const ACTOR_HOME: Record<ActorId, Point> = {
  you: { x: 34, y: LANE_Y },
  claude: { x: 236, y: LANE_Y },
  helper: { x: -50, y: LANE_Y },
}

/** Where an actor stands to work on something at `target`, on the side it approaches from. */
export function standPoint(target: Point, from: Point): Point {
  const side = from.x <= target.x ? -1 : 1
  return { x: target.x + side * 72, y: LANE_Y }
}

const BASE_H: Record<Exclude<PlaceId, 'app'>, number> = {
  bookshelf: 90, toolbox: 40, database: 76, service: 96, browser: 70, cloud: 44,
}
/** Height above a place's base point, including room for its sign. */
export function placeHeight(id: PlaceId, appFloors = 1): number {
  return (id === 'app' ? 34 + appFloors * APP_FLOOR_H : BASE_H[id]) + 32
}

const PLACES = new Set<string>(PlaceIdSchema.options)
const ACTORS = new Set<string>(ActorIdSchema.options)
export const isPlace = (s: string): s is PlaceId => PLACES.has(s)
export const isActor = (s: string): s is ActorId => ACTORS.has(s)
