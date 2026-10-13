import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { build } from 'esbuild'

rmSync('plugin/dist', { recursive: true, force: true })

// ws optionally requires these native speedups; they are not installed and not needed
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', logLevel: 'info', external: ['bufferutil', 'utf-8-validate'] }
await build({ ...common, entryPoints: ['plugin/src/emit-cli.ts'], outfile: 'plugin/dist/emit.cjs' })
await build({ ...common, entryPoints: ['plugin/src/start-server-cli.ts'], outfile: 'plugin/dist/start-server.cjs' })
await build({ ...common, entryPoints: ['packages/server/src/cli.ts'], outfile: 'plugin/dist/server.cjs' })

execSync('node_modules/.bin/vite build', { cwd: 'apps/web', stdio: 'inherit' })
