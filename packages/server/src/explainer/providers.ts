import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import type { TokenUsage } from '@sidecar/shared'

export type ModelLevel = 'haiku' | 'sonnet'
export const API_MODEL: Record<ModelLevel, string> = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5' }

export class ExplainError extends Error {
  /** `usage` is set when the failed attempt still spent tokens. */
  constructor(message: string, readonly retryable: boolean, readonly usage?: TokenUsage) {
    super(message)
    this.name = 'ExplainError'
  }
}

/** One model call: the prompt, the shape of the answer, and the most it may write. */
export interface ModelTask<T> {
  system: string
  user: string
  schema: z.ZodType<T>
  maxTokens: number
  /** The answer's shape spelled out, for the CLI, which can't enforce a schema. */
  shape: string
}
export interface ProviderResult<T> { output: T; usage: TokenUsage }
export interface Provider {
  id: 'api' | 'cli'
  call<T>(task: ModelTask<T>, level: ModelLevel): Promise<ProviderResult<T>>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the SDK's create() is heavily overloaded; tests pass a fake
export type MessagesClient = { messages: { create: (params: any) => Promise<any> } }

interface ApiUsage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
interface ApiMessage { stop_reason: string | null; content: Array<{ type: string; text?: string }>; usage: ApiUsage }

const MALFORMED = 'The explanation came back malformed.'

function classify(err: unknown): ExplainError {
  if (err instanceof Anthropic.AuthenticationError) return new ExplainError('The Anthropic API key was rejected.', false)
  if (err instanceof Anthropic.PermissionDeniedError) return new ExplainError('This API key is not allowed to use the model.', false)
  if (err instanceof Anthropic.NotFoundError) return new ExplainError("This API key can't use the explanation model.", false)
  if (err instanceof Anthropic.BadRequestError) return new ExplainError(`The explanation request was rejected: ${err.message}`, false)
  if (err instanceof Anthropic.RateLimitError) return new ExplainError('Anthropic rate limit reached.', true)
  if (err instanceof Anthropic.APIConnectionError) return new ExplainError('Could not reach Anthropic.', true)
  if (err instanceof Anthropic.APIError) return new ExplainError(`Anthropic error ${err.status ?? ''}`.trim(), (err.status ?? 500) >= 500)
  return new ExplainError(err instanceof Error ? err.message : String(err), true)
}

export function anthropicProvider(client: MessagesClient = new Anthropic({ maxRetries: 0, timeout: 60_000 })): Provider {
  return {
    id: 'api',
    async call(task, level) {
      let res: ApiMessage
      try {
        // create(), not parse(): parse() throws on malformed output before we can read stop_reason or usage
        res = await client.messages.create({
          model: API_MODEL[level],
          max_tokens: task.maxTokens,
          output_config: { effort: 'low', format: zodOutputFormat(task.schema) },
          system: task.system,
          messages: [{ role: 'user', content: task.user }],
        }) as ApiMessage
      } catch (err) {
        throw classify(err)
      }
      const u = res.usage
      const usage: TokenUsage = { input: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens }
      if (res.stop_reason === 'refusal') throw new ExplainError('The model declined to explain these steps.', false, usage)
      if (res.stop_reason === 'max_tokens') throw new ExplainError('The explanation came back cut off.', true, usage)
      const block = res.content.find((b) => b.type === 'text')
      let json: unknown
      try {
        json = JSON.parse(block?.text ?? '')
      } catch {
        throw new ExplainError(MALFORMED, true, usage)
      }
      const parsed = task.schema.safeParse(json)
      if (!parsed.success) throw new ExplainError(MALFORMED, true, usage)
      return { output: parsed.data, usage }
    },
  }
}

export type Runner = (args: string[], input: string, o: { env: NodeJS.ProcessEnv; timeoutMs: number }) =>
  Promise<{ code: number | null; stdout: string; stderr: string; timedOut?: boolean }>

export const runClaude: Runner = (args, input, o) => new Promise((resolve, reject) => {
  const child = spawn('claude', args, { env: o.env, cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, o.timeoutMs)
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
  child.on('error', (err) => { clearTimeout(timer); reject(err) })
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }) })
  // claude may exit before reading all input (EPIPE); the close handler reports the failure
  child.stdin.on('error', () => undefined)
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


/** Marks the child as Sidecar's own run and drops the markers a nested-session guard would refuse on. */
export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { CLAUDECODE: _cc, CLAUDE_CODE_ENTRYPOINT: _entry, ...rest } = env
  return { ...rest, SIDECAR_INTERNAL: '1' }
}

export function cliProvider(run: Runner = runClaude, env: NodeJS.ProcessEnv = process.env): Provider {
  return {
    id: 'cli',
    async call(task, level) {
      let r: Awaited<ReturnType<Runner>>
      try {
        r = await run(CLI_ARGS(level, task.system), `${task.shape}\n\n${task.user}`, { env: childEnv(env), timeoutMs: 120_000 })
      } catch (err) {
        const missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
        throw new ExplainError(missing ? 'The claude command is not installed.' : `Could not run claude: ${(err as Error).message}`, !missing)
      }
      if (r.timedOut) throw new ExplainError('claude took too long to answer.', true)
      if (r.code !== 0) throw new ExplainError(`claude exited with code ${r.code}: ${r.stderr.trim().slice(0, 200)}`, true)
      let outer: { is_error?: boolean; result?: unknown; usage?: Record<string, number | undefined> }
      try {
        outer = JSON.parse(r.stdout) as typeof outer
      } catch {
        throw new ExplainError('claude returned output that is not JSON.', true)
      }
      if (outer.is_error || typeof outer.result !== 'string') throw new ExplainError('claude reported an error.', true)
      const parsed = task.schema.safeParse(extractJson(outer.result))
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
    return (await run(['--version'], '', { env: childEnv(process.env), timeoutMs: 5000 })).code === 0
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
