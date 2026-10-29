import { z } from 'zod'

/** What the scan learned about version control, for the archive building and the GitHub guide. */
export const GitInfoSchema = z.object({
  repo: z.boolean(),
  remote: z.object({ host: z.string(), owner: z.string(), name: z.string() }).nullable(),
  ignoresSecrets: z.boolean(),
  ignoresDeps: z.boolean(),
  ignoresBuild: z.boolean(),
  readme: z.boolean(),
})
export type GitInfo = z.infer<typeof GitInfoSchema>

/**
 * A session's project folder as it stood when the session began: file paths relative to the folder,
 * dependency names from its manifests, and the folders that stood in for files past the scan's cap.
 */
export const BaselineSchema = z.object({
  files: z.array(z.string()),
  packages: z.array(z.string()),
  folders: z.array(z.string()),
  truncated: z.boolean(),
  git: GitInfoSchema,
  scannedAt: z.number(),
})
export type Baseline = z.infer<typeof BaselineSchema>
