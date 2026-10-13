import { z } from 'zod'

export const ActorIdSchema = z.enum(['claude', 'helper', 'you'])
export const PlaceIdSchema = z.enum(['app', 'service', 'database', 'toolbox', 'browser', 'cloud', 'bookshelf'])
export const EffectIdSchema = z.enum(['sparkle', 'success', 'error', 'thinking', 'speech'])
export const ActionIdSchema = z.enum([
  'walkTo', 'plugCable', 'hammer', 'inspect', 'hand', 'think', 'celebrate',
  'read', 'unpack', 'ship', 'launch', 'speak',
])

export type ActorId = z.infer<typeof ActorIdSchema>
export type PlaceId = z.infer<typeof PlaceIdSchema>
export type EffectId = z.infer<typeof EffectIdSchema>
export type ActionId = z.infer<typeof ActionIdSchema>

export const SceneSpecSchema = z.object({
  scene: z.string().min(1),
  cast: z.array(z.union([ActorIdSchema, z.object({ place: PlaceIdSchema, label: z.string().optional() })])),
  beats: z.array(z.union([
    z.object({ actor: ActorIdSchema, do: ActionIdSchema, to: z.string().optional() }),
    z.object({ fx: EffectIdSchema, at: z.string() }),
  ])),
  caption: z.string(),
})
export type SceneSpec = z.infer<typeof SceneSpecSchema>
