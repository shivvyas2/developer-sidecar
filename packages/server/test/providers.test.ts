import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, test } from 'vitest'
import {
  API_MODEL, CLI_ARGS, ExplainError, anthropicProvider, cliProvider, explainTask, extractJson, pickProvider,
  type MessagesClient, type Provider, type Runner,
} from '../src/explainer/providers'

const req = explainTask({ system: 'SYS', user: 'USER' })
const output = { items: [{ stepId: 'a', plain: 'p', why: 'w', concept: null, decision: null, next: null }] }

describe('anthropicProvider', () => {
  const client = (impl: (p: Record<string, unknown>) => unknown): MessagesClient => ({ messages: { create: async (p) => impl(p) } })
  const text = (t: string, stop_reason = 'end_turn', usage: Record<string, number> = { input_tokens: 100, output_tokens: 20 }) =>
    ({ stop_reason, content: [{ type: 'text', text: t }], usage })
  test('sends the model, low effort, structured output and a plain system prompt; returns parsed output and usage', async () => {
    let sent: Record<string, unknown> & { output_config?: { effort?: unknown; format?: unknown } } = {}
    const p = anthropicProvider(client((params) => {
      sent = params
      return text(JSON.stringify(output), 'end_turn', { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 })
    }))
    const r = await p.call(req, 'haiku')
    expect(sent.model).toBe(API_MODEL.haiku)
    expect(sent.model).toBe('claude-haiku-5-5')
    expect(sent.output_config?.effort).toBe('low')
    expect(sent.output_config?.format).toMatchObject({ type: 'json_schema' })
    expect(sent.system).toBe('SYS')
    expect(JSON.stringify(sent)).not.toContain('cache_control')
    expect(sent.messages).toEqual([{ role: 'user', content: 'USER' }])
    expect(r).toEqual({ output, usage: { input: 105, output: 20 } })
  })
  test('sonnet level uses claude-sonnet-5-5', async () => {
    let model = ''
    await anthropicProvider(client((params) => { model = String(params.model); return text(JSON.stringify(output)) })).call(req, 'sonnet')
    expect(model).toBe('claude-sonnet-5-5')
  })
  test('a refusal is not retryable and carries the usage spent', async () => {
    const p = anthropicProvider(client(() => text('', 'refusal', { input_tokens: 9, output_tokens: 1 })))
    await expect(p.call(req, 'haiku')).rejects.toMatchObject({ retryable: false, usage: { input: 9, output: 1 } })
  })
  test('a truncated answer is retryable and carries the usage spent', async () => {
    const p = anthropicProvider(client(() => text('{"items":[', 'max_tokens', { input_tokens: 9, output_tokens: 8000 })))
    await expect(p.call(req, 'haiku')).rejects.toMatchObject({ retryable: true, usage: { input: 9, output: 8000 } })
  })
  test('malformed text (not JSON, or the wrong shape) is retryable and carries the usage spent', async () => {
    for (const bad of ['not json', '{"items":[{"bad":1}]}']) {
      const p = anthropicProvider(client(() => text(bad, 'end_turn', { input_tokens: 4, output_tokens: 2 })))
      await expect(p.call(req, 'haiku')).rejects.toMatchObject({ message: 'The explanation came back malformed.', retryable: true, usage: { input: 4, output: 2 } })
    }
    const none = anthropicProvider(client(() => ({ stop_reason: 'end_turn', content: [], usage: { input_tokens: 4, output_tokens: 0 } })))
    await expect(none.call(req, 'haiku')).rejects.toMatchObject({ retryable: true, usage: { input: 4, output: 0 } })
  })
  test('a 404 means the key cannot use the model and is not retryable', async () => {
    const p = anthropicProvider(client(() => { throw new Anthropic.NotFoundError(404, { type: 'error' }, 'model not found', new Headers()) }))
    await expect(p.call(req, 'haiku')).rejects.toMatchObject({ message: "This API key can't use the explanation model.", retryable: false })
  })
  test('unknown thrown errors become retryable ExplainErrors', async () => {
    const p = anthropicProvider(client(() => { throw new Error('socket hang up') }))
    const err = await p.call(req, 'haiku').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ExplainError)
    expect((err as ExplainError).retryable).toBe(true)
  })
})

describe('cliProvider', () => {
  const ok: Runner = async () => ({ code: 0, stderr: '', stdout: JSON.stringify({ type: 'result', is_error: false, result: 'Here you go:\n' + JSON.stringify(output), usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 7 } }) })

  test('runs claude -p with the haiku alias, JSON output and SIDECAR_INTERNAL=1 (Review Focus 4)', async () => {
    let seen: { args: string[]; input: string; env: NodeJS.ProcessEnv } | null = null
    const run: Runner = async (args, input, o) => { seen = { args, input, env: o.env }; return ok(args, input, o) }
    const r = await cliProvider(run, { PATH: '/bin', ANTHROPIC_API_KEY: '' }).call(req, 'haiku')
    expect(seen!.args).toEqual(CLI_ARGS('haiku', 'SYS'))
    expect(seen!.args.slice(0, 5)).toEqual(['-p', '--model', 'haiku', '--output-format', 'json'])
    expect(seen!.env.SIDECAR_INTERNAL).toBe('1')
    expect(seen!.env.PATH).toBe('/bin')
    expect(seen!.input).toContain('USER')
    expect(r).toEqual({ output, usage: { input: 57, output: 10 } })
  })
  test('the child env drops the nested-session markers (final fix 10)', async () => {
    let env: NodeJS.ProcessEnv = {}
    const run: Runner = async (args, input, o) => { env = o.env; return ok(args, input, o) }
    await cliProvider(run, { PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli' }).call(req, 'haiku')
    expect(env).not.toHaveProperty('CLAUDECODE')
    expect(env).not.toHaveProperty('CLAUDE_CODE_ENTRYPOINT')
    expect(env).toMatchObject({ PATH: '/bin', SIDECAR_INTERNAL: '1' })
  })
  test('failures are ExplainErrors; a missing binary is not retryable', async () => {
    await expect(cliProvider(async () => ({ code: 1, stdout: '', stderr: 'boom' })).call(req, 'haiku')).rejects.toMatchObject({ retryable: true })
    await expect(cliProvider(async () => ({ code: 0, stdout: 'not json', stderr: '' })).call(req, 'haiku')).rejects.toMatchObject({ retryable: true })
    await expect(cliProvider(async () => ({ code: 0, stdout: JSON.stringify({ is_error: false, result: '{"items":[{"bad":1}]}' }), stderr: '' })).call(req, 'haiku')).rejects.toMatchObject({ retryable: true })
    await expect(cliProvider(async () => { throw Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) }).call(req, 'haiku')).rejects.toMatchObject({ retryable: false })
  })
  test('a timed-out run is labelled as such and is retryable', async () => {
    const err = await cliProvider(async () => ({ code: null, stdout: '', stderr: '', timedOut: true })).call(req, 'haiku').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ExplainError)
    expect(err).toMatchObject({ message: 'claude took too long to answer.', retryable: true })
  })
  test('extractJson finds the object inside prose and code fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('no json')).toBeNull()
  })
})

describe('pickProvider', () => {
  const api: Provider = { id: 'api', call: async () => { throw new Error('unused') } }
  const cli: Provider = { id: 'cli', call: async () => { throw new Error('unused') } }
  const pick = (env: NodeJS.ProcessEnv, has: boolean) => pickProvider({ env, hasClaude: async () => has, api: () => api, cli: () => cli })
  test('API key first, then the claude CLI, then none; SIDECAR_EXPLAINER=off wins', async () => {
    expect(await pick({ ANTHROPIC_API_KEY: 'k' }, true)).toBe(api)
    expect(await pick({}, true)).toBe(cli)
    expect(await pick({}, false)).toBeNull()
    expect(await pick({ ANTHROPIC_API_KEY: 'k', SIDECAR_EXPLAINER: 'off' }, true)).toBeNull()
  })
})

describe('a model task', () => {
  const task = { system: 'S', user: 'U', schema: z.object({ answer: z.string() }), maxTokens: 321, shape: 'SHAPE: {"answer":"…"}' }
  test('the API gets the task’s token cap and schema, and its answer is checked against that schema', async () => {
    let sent: Record<string, unknown> & { output_config?: { format?: { schema?: unknown } } } = {}
    const usage = { input_tokens: 3, output_tokens: 2 }
    const p = anthropicProvider({ messages: { create: async (params) => { sent = params; return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"answer":"yes"}' }], usage } } } })
    expect(await p.call(task, 'haiku')).toEqual({ output: { answer: 'yes' }, usage: { input: 3, output: 2 } })
    expect(sent.max_tokens).toBe(321)
    expect(JSON.stringify(sent.output_config?.format)).toContain('answer')
    const wrong = anthropicProvider({ messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"items":[]}' }], usage }) } })
    await expect(wrong.call(task, 'haiku')).rejects.toMatchObject({ retryable: true })
  })
  test('the CLI is told the task’s shape and checks the answer against its schema', async () => {
    let input = ''
    const run: Runner = async (_a, i) => { input = i; return { code: 0, stderr: '', stdout: JSON.stringify({ is_error: false, result: '{"answer":"ok"}', usage: { input_tokens: 1, output_tokens: 1 } }) } }
    expect((await cliProvider(run, {}).call(task, 'haiku')).output).toEqual({ answer: 'ok' })
    expect(input.startsWith('SHAPE: {"answer":"…"}\n\nU')).toBe(true)
    const bad: Runner = async () => ({ code: 0, stderr: '', stdout: JSON.stringify({ is_error: false, result: '{"nope":1}' }) })
    await expect(cliProvider(bad, {}).call(task, 'haiku')).rejects.toMatchObject({ retryable: true })
  })
})
