// Runs the mod's engine tests: stage the built plugin without its Vitest files, then validate and test it.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'

const STAGE = '.mod-test'
if (!existsSync('plugin/dist/mod/register.js')) {
  console.error('plugin/dist/mod/register.js is missing: run pnpm build first')
  process.exit(1)
}
rmSync(STAGE, { recursive: true, force: true })
mkdirSync(`${STAGE}/hooks`, { recursive: true })
mkdirSync(`${STAGE}/dist/mod`, { recursive: true })
mkdirSync(`${STAGE}/test`, { recursive: true })
cpSync('plugin/.claude-plugin', `${STAGE}/.claude-plugin`, { recursive: true })
writeFileSync(`${STAGE}/hooks/hooks.json`, JSON.stringify({ modules: ['../dist/mod/register.js'] }))
cpSync('plugin/dist/mod/register.js', `${STAGE}/dist/mod/register.js`)
for (const f of readdirSync('plugin/mod-test')) if (f.endsWith('.test.ts')) cpSync(`plugin/mod-test/${f}`, `${STAGE}/test/${f}`)

const run = (args) => spawnSync('claude', args, { stdio: 'inherit' }).status ?? 1
const status = run(['plugin', 'validate', 'plugin']) || run(['plugin', 'validate', STAGE]) || run(['plugin', 'test', STAGE])
process.exit(status)
