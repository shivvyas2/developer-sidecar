import { z } from 'zod'

export const EventKindSchema = z.enum([
  'session_start', 'prompt', 'tool_start', 'tool_end', 'subagent_end', 'notice', 'turn_end',
])
export type EventKind = z.infer<typeof EventKindSchema>

export const SidecarEventSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  ts: z.number(),
  cwd: z.string(),
  kind: EventKindSchema,
  tool: z.object({
    name: z.string(),
    useId: z.string().optional(),
    input: z.unknown(),
    output: z.unknown().optional(),
    ok: z.boolean().optional(),
  }).optional(),
  prompt: z.string().optional(),
  raw: z.unknown().optional(),
})
export type SidecarEvent = z.infer<typeof SidecarEventSchema>
