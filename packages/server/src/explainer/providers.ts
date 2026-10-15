import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { TokenUsage } from '@sidecar/shared'
import { ExplainOutputSchema, type ExplainOutput, type ExplainRequest } from './prompt'

export type ModelLevel = 'haiku' | 'sonnet'
export const API_MODEL: Record<ModelLevel, string> = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5' }

export class ExplainError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'ExplainError'
  }
}

export interface ProviderResult { output: ExplainOutput; usage: TokenUsage }
export interface Provider {
  id: 'api' | 'cli'
  explain(req: ExplainRequest, level: ModelLevel): Promise<ProviderResult>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the SDK's parse() is generic; tests pass a fake
export type ParseClient = { messages: { parse: (params: any) => Promise<any> } }

function classify(err: unknown): ExplainError {
  if (err instanceof Anthropic.AuthenticationError) return new ExplainError('The Anthropic API key was rejected.', false)
  if (err instanceof Anthropic.PermissionDeniedError) return new ExplainError('This API key is not allowed to use the model.', false)
  if (err instanceof Anthropic.BadRequestError) return new ExplainError(`The explanation request was rejected: ${err.message}`, false)
  if (err instanceof Anthropic.RateLimitError) return new ExplainError('Anthropic rate limit reached.', true)
  if (err instanceof Anthropic.APIConnectionError) return new ExplainError('Could not reach Anthropic.', true)
  if (err instanceof Anthropic.APIError) return new ExplainError(`Anthropic error ${err.status ?? ''}`.trim(), (err.status ?? 500) >= 500)
  return new ExplainError(err instanceof Error ? err.message : String(err), true)
}

export function anthropicProvider(client: ParseClient = new Anthropic({ maxRetries: 0, timeout: 60_000 })): Provider {
  return {
    id: 'api',
    async explain(req, level) {
      let res: {
        stop_reason: string | null
        parsed_output: ExplainOutput | null
        usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
      }
      try {
        res = await client.messages.parse({
          model: API_MODEL[level],
          max_tokens: 8000,
          output_config: { effort: 'low', format: zodOutputFormat(ExplainOutputSchema) },
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: req.user }],
        })
      } catch (err) {
        throw classify(err)
      }
      if (res.stop_reason === 'refusal') throw new ExplainError('The model declined to explain these steps.', false)
      if (res.stop_reason === 'max_tokens' || !res.parsed_output) throw new ExplainError('The explanation came back cut off or malformed.', true)
      const u = res.usage
      return {
        output: res.parsed_output,
        usage: { input: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens },
      }
    },
  }
}

export type Runner = (args: string[], input: string, o: { env: NodeJS.ProcessEnv; timeoutMs: number }) =>
  Promise<{ code: number | null; stdout: string; stderr: string }>

export const runClaude: Runner = (args, input, o) => new Promise((resolve, reject) => {
  const child = spawn('claude', args, { env: o.env, cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  const timer = setTimeout(() => child.kill('SIGKILL'), o.timeoutMs)
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
  child.on('error', (err) => { clearTimeout(timer); reject(err) })
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  child.stdin.end(input)
})

/** A bare, tool-less, plugin-less one-shot run, so the child can't fire Sidecar's own hooks or touch files. */
export const CLI_ARGS = (level: ModelLevel, system: string): string[] => [
  '-p', '--model', level, '--output-format', 'json',
  '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--tools', '',
  '--system-prompt', system,
]

export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

const JSON_SHAPE = 'Respond with ONLY one JSON object of the form {"items":[{"stepId":"…","plain":"…","why":"…","concept":{"term":"…","definition":"…"} or null,"decision":{"title":"…","choice":"…","alternatives":["…"],"reason":"…"} or null}]} and nothing else.'

export function cliProvider(run: Runner = runClaude, env: NodeJS.ProcessEnv = process.env): Provider {
  return {
    id: 'cli',
    async explain(req, level) {
      let r: Awaited<ReturnType<Runner>>
      try {
        r = await run(CLI_ARGS(level, req.system), `${JSON_SHAPE}\n\n${req.user}`, { env: { ...env, SIDECAR_INTERNAL: '1' }, timeoutMs: 120_000 })
      } catch (err) {
        const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
        throw new ExplainError(missing ? 'The claude command is not installed.' : `Could not run claude: ${(err as Error).message}`, !missing)
      }
      if (r.code !== 0) throw new ExplainError(`claude exited with code ${r.code}: ${r.stderr.trim().slice(0, 200)}`, true)
      let outer: { is_error?: boolean; result?: unknown; usage?: Record<string, number | undefined> }
      try {
        outer = JSON.parse(r.stdout) as typeof outer
      } catch {
        throw new ExplainError('claude returned output that is not JSON.', true)
      }
      if (outer.is_error || typeof outer.result !== 'string') throw new ExplainError('claude reported an error.', true)
      const parsed = ExplainOutputSchema.safeParse(extractJson(outer.result))
      if (!parsed.success) throw new ExplainError('claude returned explanations in the wrong shape.', true)
      const u = outer.usage ?? {}
      return {
        output: parsed.data,
        usage: { input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0 },
      }
    },
  }
}

export const claudeAvailable = (run: Runner = runClaude) => async (): Promise<boolean> => {
  try {
    return (await run(['--version'], '', { env: { ...process.env, SIDECAR_INTERNAL: '1' }, timeoutMs: 5000 })).code === 0
  } catch {
    return false
  }
}

export async function pickProvider(o: {
  env: NodeJS.ProcessEnv
  hasClaude: () => Promise<boolean>
  api?: () => Provider
  cli?: () => Provider
}): Promise<Provider | null> {
  if (o.env.SIDECAR_EXPLAINER === 'off') return null
  if (o.env.ANTHROPIC_API_KEY) return (o.api ?? (() => anthropicProvider()))()
  if (await o.hasClaude()) return (o.cli ?? (() => cliProvider()))()
  return null
}
