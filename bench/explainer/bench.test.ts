import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { isExplained } from '@sidecar/shared'
import { normalize } from '../../packages/server/src/explainer/prompt'
import { anthropicProvider, API_MODEL, explainTask } from '../../packages/server/src/explainer/providers'
import { runSession, statsOf, idsIn, type SessionRun, type Stats } from './run'
import { SESSIONS } from './sessions'

const LIVE = process.env.BENCH_LIVE === '1'
// a live run reports exact input tokens itself, so counting them too would only pay for calls thrown away
const COUNT = process.env.BENCH_COUNT === '1' && !LIVE
const UPDATE = process.env.BENCH_UPDATE === '1'

const here = (p: string) => new URL(p, import.meta.url)
const OUT = here('./out/')
const BASELINE = here('./baseline.json')

type Row = Stats & { inputTokens?: number; outputTokens?: number }
type Baseline = Record<string, Row>

const key = () => {
  const k = process.env.ANTHROPIC_API_KEY
  if (!k) throw new Error('BENCH_COUNT and BENCH_LIVE need ANTHROPIC_API_KEY')
  return k
}

/** Exact input tokens for a request, without generating anything. Raw fetch: the SDK isn't a root dependency. */
async function countTokens(system: string, user: string): Promise<number> {
  const res = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: API_MODEL.haiku, system, messages: [{ role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`count_tokens answered ${res.status}: ${await res.text()}`)
  return ((await res.json()) as { input_tokens: number }).input_tokens
}

const pct = (now: number, was: number | undefined) =>
  was === undefined || was === 0 ? '' : ` (${now - was >= 0 ? '+' : ''}${Math.round(((now - was) / was) * 100)}%)`

function table(rows: Record<string, Row>, base: Baseline): string {
  const cols: Array<[keyof Row, string]> = [
    ['finished', 'finished'], ['sent', 'sent'], ['batches', 'batches'], ['stepChars', 'step chars'], ['requestChars', 'request chars'],
    ['estInputTokens', 'est. input tok'], ['estOutputTokens', 'est. output tok'], ['inputTokens', 'input tok'], ['outputTokens', 'output tok'],
  ]
  const used = cols.filter(([k]) => Object.values(rows).some((r) => r[k] !== undefined))
  const head = `| session | ${used.map(([, h]) => h).join(' | ')} |\n|---|${used.map(() => '---:').join('|')}|`
  const body = Object.entries(rows).map(([name, r]) =>
    `| ${name} | ${used.map(([k]) => r[k] === undefined ? '' : `${r[k]}${pct(r[k]!, base[name]?.[k])}`).join(' | ')} |`)
  return [head, ...body].join('\n')
}

function sum(rows: Row[]): Row {
  const out: Row = { finished: 0, sent: 0, batches: 0, stepChars: 0, requestChars: 0, estInputTokens: 0, estOutputTokens: 0 }
  for (const r of rows) {
    for (const k of Object.keys(r) as Array<keyof Row>) out[k] = (out[k] ?? 0) + (r[k] ?? 0)
  }
  return out
}

test('explainer token bench', { timeout: 10 * 60_000 }, async () => {
  const runs: SessionRun[] = []
  for (const s of SESSIONS) runs.push(await runSession(s))
  mkdirSync(OUT, { recursive: true })

  const rows: Record<string, Row> = {}
  const notes: string[] = []
  const live = LIVE ? anthropicProvider() : null
  for (const run of runs) {
    const row: Row = statsOf(run)
    if (COUNT) {
      row.inputTokens = 0
      for (const r of run.requests) row.inputTokens += await countTokens(r.system, r.user)
    }
    if (live) {
      row.inputTokens = 0
      row.outputTokens = 0
      const byId = new Map(run.steps.map((s) => [s.id, s]))
      notes.push(`## ${run.name}\n`)
      for (const [i, r] of run.requests.entries()) {
        const res = await live.call(explainTask(r), 'haiku')
        row.inputTokens += res.usage.input
        row.outputTokens += res.usage.output
        const ids = idsIn(r)
        for (const [id, e] of normalize(res.output, ids)) {
          const s = byId.get(run.batches[i]![ids.indexOf(id)]!)
          notes.push(`### ${s?.category ?? '?'} · ${s?.status ?? '?'} · ${s?.caption ?? id}\n`)
          if (isExplained(e)) {
            notes.push(`${e.plain}\n\n*Why:* ${e.why}`)
            if (e.concept) notes.push(`\n*Term:* **${e.concept.term}**: ${e.concept.definition}`)
            if (e.decision) notes.push(`\n*Decision:* ${e.decision.title}: ${e.decision.choice} (vs ${e.decision.alternatives.join(', ')}). ${e.decision.reason}`)
          }
          notes.push('')
        }
      }
    }
    rows[run.name] = row
    writeFileSync(new URL(`${run.name}.requests.txt`, OUT), run.requests.map((r, i) => `=== request ${i + 1} ===\n${r.user}`).join('\n\n'))
    expect(row.sent).toBeLessThanOrEqual(row.finished)
  }
  rows.total = sum(Object.values(rows))

  const base: Baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline : {}
  const report = [
    '# Explainer token bench',
    '',
    `Mode: ${LIVE ? 'live (real Haiku calls)' : COUNT ? 'count (exact input tokens)' : 'offline (estimates at ~4 chars/token)'}. Percentages compare with baseline.json.`,
    '',
    table(rows, base),
    ...(notes.length ? ['', '# Explanations', '', ...notes] : []),
  ].join('\n')
  writeFileSync(new URL('report.md', OUT), `${report}\n`)
  console.log(`\n${table(rows, base)}\n\nFull report: bench/explainer/out/report.md`)

  if (UPDATE) {
    writeFileSync(BASELINE, `${JSON.stringify(rows, null, 2)}\n`)
  }
})
