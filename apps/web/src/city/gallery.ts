// Dev-only page (/city-gallery.html under `vite`): sample towns at every stage, to check the drawing by eye.
// Not part of the build, which only takes index.html.
import { townOf, type Baseline, type TownInputStep } from '@sidecar/shared'
import { CityRenderer } from './renderer'

let n = 0
const s = (toolName: string, category: TownInputStep['category'], input: Record<string, unknown>, status: TownInputStep['status'] = 'ok', output?: unknown): TownInputStep =>
  ({ id: `g${++n}`, toolName, category, status, input, ...(output ? { output } : {}) })
const write = (p: string) => s('Write', 'create', { file_path: `/p/${p}`, content: '' })
const bash = (c: string, cat: TownInputStep['category'], st: TownInputStep['status'] = 'ok', out?: unknown) => s('Bash', cat, { command: c }, st, out)
const git = { repo: true, remote: null, ignoresSecrets: true, ignoresDeps: true, ignoresBuild: true, readme: true }
const existing: Baseline = { files: ['app/page.tsx', 'app/cart/page.tsx', 'app/api/orders/route.ts', 'prisma/schema.prisma', 'lib/format.ts', '.env.local', 'app/checkout/page.tsx'], packages: ['next', 'stripe', 'resend', '@clerk/nextjs'], folders: [], truncated: false, git, scannedAt: 0 }

const steps: TownInputStep[] = [
  s('Read', 'read', { file_path: '/p/README.md' }),
  bash('npm install next react', 'install'),
  write('lib/sum.ts'),
  bash('npm test', 'test'),
  write('app/page.tsx'), write('app/cart/page.tsx'),
  write('app/api/checkout/route.ts'), write('prisma/schema.prisma'),
  bash('npm install stripe', 'install'), write('app/checkout/page.tsx'), bash('npm test', 'test', 'failed'),
  bash('vercel deploy --prod', 'deploy'),
]
const cuts: [string, number][] = [['lot', 0], ['dig', 1], ['foundation', 2], ['bricks', 3], ['concrete', 4], ['walls', 6], ['neighbours', 8], ['neighbourhood', 11], ['town', 12]]

const canvas = document.getElementById('c') as HTMLCanvasElement
const params = new URLSearchParams(location.search)
const r = new CityRenderer(canvas, { theme: params.has('dark') ? 'dark' : 'light', reducedMotion: false })
const size = () => r.resize(innerWidth, innerHeight)
addEventListener('resize', size); size()
const bar = document.getElementById('bar')!
const show = (i: number) => {
  const [, k] = cuts[i]!
  r.setTown(townOf(steps.slice(0, k), { cwd: '/p' }))
  ;[...bar.children].forEach((b, j) => b.classList.toggle('on', j === i))
}
cuts.forEach(([name], i) => { const b = document.createElement('button'); b.textContent = name; b.onclick = () => show(i); bar.append(b) })
const ex = document.createElement('button'); ex.textContent = 'existing app'; ex.onclick = () => r.setTown(townOf([], { cwd: '/p', baseline: existing })); bar.append(ex)
show(Number(params.get('stage') ?? 0))
;(window as unknown as { cityShow: (i: number) => void }).cityShow = show
