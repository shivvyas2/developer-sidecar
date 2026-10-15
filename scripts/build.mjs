import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { build } from 'esbuild'

rmSync('plugin/dist', { recursive: true, force: true })

// ws optionally requires these native speedups; they are not installed and not needed
const common = { bundle: true, platform: 'node', target: 'node22', format: 'cjs', logLevel: 'info', external: ['bufferutil', 'utf-8-validate'] }
await build({ ...common, entryPoints: ['plugin/src/emit-cli.ts'], outfile: 'plugin/dist/emit.cjs' })
await build({ ...common, entryPoints: ['plugin/src/start-server-cli.ts'], outfile: 'plugin/dist/start-server.cjs' })
await build({ ...common, entryPoints: ['plugin/src/locate-cli.ts'], outfile: 'plugin/dist/locate.cjs' })
// zod's `z` namespace re-exports every locale; the mod only ever reports in English.
const englishOnly = {
  name: 'zod-english-only',
  setup(b) {
    b.onResolve({ filter: /^\.\.\/locales\/index\.js$/ }, (args) =>
      args.importer.includes('/zod/') ? { path: 'zod-locales', namespace: 'zod-en', pluginData: dirname(args.importer) } : undefined)
    b.onLoad({ filter: /.*/, namespace: 'zod-en' }, (args) => ({
      contents: `export { default as en } from ${JSON.stringify(join(args.pluginData, '..', 'locales', 'en.js'))}`,
      resolveDir: args.pluginData,
    }))
  },
}

// The mod runs in the engine's own module environment: one ES module, no Node, no DOM.
// Whitespace and syntax are minified but names are kept: the engine reads `$` and `on` in the source.
await build({
  bundle: true, platform: 'neutral', format: 'esm', target: 'es2022', logLevel: 'info',
  mainFields: ['module', 'main'], minifyWhitespace: true, minifySyntax: true, plugins: [englishOnly],
  entryPoints: ['plugin/src/mod/register.ts'], outfile: 'plugin/dist/mod/register.js',
})
await build({ ...common, entryPoints: ['packages/server/src/cli.ts'], outfile: 'plugin/dist/server.cjs' })

execSync('node_modules/.bin/vite build', { cwd: 'apps/web', stdio: 'inherit' })
