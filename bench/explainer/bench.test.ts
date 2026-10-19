import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { anthropicProvider, API_MODEL, type ModelTask } from '../../packages/server/src/explainer/providers'
import { RecapOutputSchema } from '../../packages/server/src/explainer/recap-prompt'
import { runSession, statsOf, turnsIn, type SessionRun, type Stats } from './run'
import { SESSIONS } from './sessions'

const LIVE = process.env.BENCH_LIVE === '1'
// a live run reports exact input tokens itself, so counting them too would only pay for calls thrown away
const COUNT = process.env.BENCH_COUNT === '1' && !LIVE
const UPDATE = process.env.BENCH_UPDATE === '1'

const here = (p: string) => new URL(p, import.meta.url)
const OUT = here('./out/')
const BASELINE = here('./baseline.json')

type Row = Partial<Stats> & { inputTokens?: number; outputTokens?: number }
/** perStep: the step explainer just before recaps replaced it (frozen). perTurn: the last BENCH_UPDATE. */
interface Baseline { perStep?: Record<string, Row>; perTurn?: Record<string, Row> }

const key = () => {
  const k = process.env.ANTHROPIC_API_KEY
  if (!k) throw new Error('BENCH_COUNT and BENCH_LIVE need ANTHROPIC_API_KEY')
  return k
}

/** Exact input tokens for a request, without generating anything. Raw fetch: the SDK isn't a root dependency. */
async function countTokens(r: ModelTask<unknown>): Promise<number> {
  const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: API_MODEL.haiku, system: r.system, messages: [{ role: 'user', content: r.user }] }),
  })
  if (!res.ok) throw new Error(`count_tokens answered ${res.status}: ${await res.text()}`)
  return ((await res.json()) as { input_tokens: number }).input_tokens
}

const pct = (now: number, was: number | undefined) =>
  was === undefined || was === 0 ? '' : ` (${now - was >= 0 ? '+' : ''}${Math.round(((now - was) / was) * 100)}%)`

function table(rows: Record<string, Row>, base: Record<string, Row>): string {
  const cols: Array<[keyof Row, string]> = [
    ['finished', 'finished'], ['turns', 'turns'], ['calls', 'calls'], ['requestChars', 'request chars'],
    ['estInputTokens', 'est. input tok'], ['estOutputTokens', 'est. output tok'], ['inputTokens', 'input tok'], ['outputTokens', 'output tok'],
  ]
  const used = cols.filter(([k]) => Object.values(rows).some((r) => r[k] !== undefined))
  const head = `| session | ${used.map(([, h]) => h).join(' | ')} |\n|---|${used.map(() => '---:').join('|')}|`
  const body = Object.entries(rows).map(([name, r]) =>
    `| ${name} | ${used.map(([k]) => r[k] === undefined ? '' : `${r[k]}${pct(r[k]!, base[name]?.[k])}`).join(' | ')} |`)
  return [head, ...body].join('\n')
}

function sum(rows: Row[]): Row {
  const out: Row = {}
  for (const r of rows) for (const k of Object.keys(r) as Array<keyof Row>) out[k] = (out[k] ?? 0) + (r[k] ?? 0)
  return out
}

test('explainer token bench', { timeout: 10 * 60_000 }, async () => {
  const runs: Array<[SessionRun, number]> = []
  for (const s of SESSIONS) runs.push([await runSession(s), turnsIn(s)])
  mkdirSync(OUT, { recursive: true })

  const rows: Record<string, Row> = {}
  const notes: string[] = []
  const live = LIVE ? anthropicProvider() : null
  for (const [run, turns] of runs) {
    const row: Row = statsOf(run, turns)
    if (COUNT) {
      row.inputTokens = 0
      for (const r of run.requests) row.inputTokens += await countTokens(r)
    }
    if (live) {
      row.inputTokens = 0
      row.outputTokens = 0
      notes.push(`## ${run.name}\n`)
      for (const [i, r] of run.requests.entries()) {
        const res = await live.call({ ...r, schema: RecapOutputSchema }, 'haiku')
        row.inputTokens += res.usage.input
        row.outputTokens += res.usage.output
        const o = res.output
        notes.push(`### Turn ${i + 1}\n\n${o.summary}\n\n*What it means:* ${o.meaning}`)
        if (o.next) notes.push(`\n*Next:* ${o.next}`)
        for (const d of o.decisions) notes.push(`\n*Decision (${d.step}):* ${d.title}: ${d.choice} (vs ${d.alternatives.join(', ')}). ${d.reason}`)
        for (const c of o.concepts) notes.push(`\n*Term (${c.step}):* **${c.term}**: ${c.definition}`)
        notes.push('')
      }
    }
    rows[run.name] = row
    writeFileSync(new URL(`${run.name}.requests.txt`, OUT), run.requests.map((r, i) => `=== request ${i + 1} ===\n${r.user}`).join('\n\n'))
    expect(row.calls).toBeLessThanOrEqual(turns)
  }
  rows.total = sum(Object.values(rows))

  const base: Baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline : {}
  const report = [
    '# Explainer token bench',
    '',
    `Mode: ${LIVE ? 'live (real Haiku calls)' : COUNT ? 'count (exact input tokens)' : 'offline (estimates at ~4 chars/token)'}. Percentages compare with the per-step explainer this replaced (baseline.json perStep).`,
    '',
    table(rows, base.perStep ?? {}),
    ...(notes.length ? ['', '# Recaps', '', ...notes] : []),
  ].join('\n')
  writeFileSync(new URL('report.md', OUT), `${report}\n`)
  console.log(`\n${table(rows, base.perStep ?? {})}\n\nFull report: bench/explainer/out/report.md`)

  if (UPDATE) writeFileSync(BASELINE, `${JSON.stringify({ ...base, perTurn: rows }, null, 2)}\n`)
})
