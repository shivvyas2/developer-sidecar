import { describe, expect, test } from 'vitest'
import {
  API_MODEL, CLI_ARGS, ExplainError, anthropicProvider, cliProvider, extractJson, pickProvider,
  type ParseClient, type Provider, type Runner,
} from '../src/explainer/providers'

const req = { system: 'SYS', user: 'USER' }
const output = { items: [{ stepId: 'a', plain: 'p', why: 'w', concept: null, decision: null }] }

describe('anthropicProvider', () => {
  const client = (impl: (p: Record<string, unknown>) => unknown): ParseClient => ({ messages: { parse: async (p) => impl(p) } })
  test('sends the model, low effort, structured output and the cached system prompt; returns parsed output and usage', async () => {
    let sent: Record<string, any> = {}
    const p = anthropicProvider(client((params) => {
      sent = params
      return { stop_reason: 'end_turn', parsed_output: output, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 0 } }
    }))
    const r = await p.explain(req, 'haiku')
    expect(sent.model).toBe(API_MODEL.haiku)
    expect(sent.model).toBe('claude-haiku-5-5')
    expect(sent.output_config.effort).toBe('low')
    expect(sent.output_config.format).toBeDefined()
    expect(sent.system[0]).toMatchObject({ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } })
    expect(sent.messages).toEqual([{ role: 'user', content: 'USER' }])
    expect(r).toEqual({ output, usage: { input: 105, output: 20 } })
  })
  test('sonnet level uses claude-sonnet-5-5', async () => {
    let model = ''
    await anthropicProvider(client((params) => { model = String(params.model); return { stop_reason: 'end_turn', parsed_output: output, usage: { input_tokens: 1, output_tokens: 1 } } })).explain(req, 'sonnet')
    expect(model).toBe('claude-sonnet-5-5')
  })
  test('a refusal is not retryable; a truncated or unparsed answer is (Review Focus 3)', async () => {
    const refusal = anthropicProvider(client(() => ({ stop_reason: 'refusal', parsed_output: null, usage: { input_tokens: 1, output_tokens: 0 } })))
    await expect(refusal.explain(req, 'haiku')).rejects.toMatchObject({ retryable: false })
    const cut = anthropicProvider(client(() => ({ stop_reason: 'max_tokens', parsed_output: null, usage: { input_tokens: 1, output_tokens: 1 } })))
    await expect(cut.explain(req, 'haiku')).rejects.toMatchObject({ retryable: true })
  })
  test('unknown thrown errors become retryable ExplainErrors', async () => {
    const p = anthropicProvider(client(() => { throw new Error('socket hang up') }))
    const err = await p.explain(req, 'haiku').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ExplainError)
    expect((err as ExplainError).retryable).toBe(true)
  })
})

describe('cliProvider', () => {
  const ok: Runner = async () => ({ code: 0, stderr: '', stdout: JSON.stringify({ type: 'result', is_error: false, result: 'Here you go:\n' + JSON.stringify(output), usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 7 } }) })

  test('runs claude -p with the haiku alias, JSON output and SIDECAR_INTERNAL=1 (Review Focus 4)', async () => {
    let seen: { args: string[]; input: string; env: NodeJS.ProcessEnv } | null = null
    const run: Runner = async (args, input, o) => { seen = { args, input, env: o.env }; return ok(args, input, o) }
    const r = await cliProvider(run, { PATH: '/bin', ANTHROPIC_API_KEY: '' }).explain(req, 'haiku')
    expect(seen!.args).toEqual(CLI_ARGS('haiku', 'SYS'))
    expect(seen!.args.slice(0, 5)).toEqual(['-p', '--model', 'haiku', '--output-format', 'json'])
    expect(seen!.env.SIDECAR_INTERNAL).toBe('1')
    expect(seen!.input).toContain('USER')
    expect(r).toEqual({ output, usage: { input: 57, output: 10 } })
  })
  test('failures are ExplainErrors; a missing binary is not retryable', async () => {
    await expect(cliProvider(async () => ({ code: 1, stdout: '', stderr: 'boom' })).explain(req, 'haiku')).rejects.toMatchObject({ retryable: true })
    await expect(cliProvider(async () => ({ code: 0, stdout: 'not json', stderr: '' })).explain(req, 'haiku')).rejects.toMatchObject({ retryable: true })
    await expect(cliProvider(async () => ({ code: 0, stdout: JSON.stringify({ is_error: false, result: '{"items":[{"bad":1}]}' }), stderr: '' })).explain(req, 'haiku')).rejects.toMatchObject({ retryable: true })
    await expect(cliProvider(async () => { throw Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) }).explain(req, 'haiku')).rejects.toMatchObject({ retryable: false })
  })
  test('extractJson finds the object inside prose and code fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('no json')).toBeNull()
  })
})

describe('pickProvider', () => {
  const api: Provider = { id: 'api', explain: async () => { throw new Error('unused') } }
  const cli: Provider = { id: 'cli', explain: async () => { throw new Error('unused') } }
  const pick = (env: NodeJS.ProcessEnv, has: boolean) => pickProvider({ env, hasClaude: async () => has, api: () => api, cli: () => cli })
  test('API key first, then the claude CLI, then none; SIDECAR_EXPLAINER=off wins', async () => {
    expect(await pick({ ANTHROPIC_API_KEY: 'k' }, true)).toBe(api)
    expect(await pick({}, true)).toBe(cli)
    expect(await pick({}, false)).toBeNull()
    expect(await pick({ ANTHROPIC_API_KEY: 'k', SIDECAR_EXPLAINER: 'off' }, true)).toBeNull()
  })
})
