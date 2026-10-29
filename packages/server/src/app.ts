import { readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { Hono, type Context, type Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { SIDECAR_NAME, SettingsSchema, SidecarEventSchema } from '@sidecar/shared'
import type { Explainer } from './explainer/recap'
import type { Hub } from './hub'
import type { Pipeline } from './pipeline'
import type { SettingsStore } from './settings'
import type { Store } from './store'

export interface AppOptions {
  pipeline: Pipeline
  store: Store
  hub: Hub
  settings: SettingsStore
  explainer: Pick<Explainer, 'state' | 'settingsChanged'>
  token: string
  port: () => number
  version: string
  staticDir?: string
}

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.html': 'text/html; charset=utf-8',
}

export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  return origin === undefined || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
}

function safeFile(root: string, rel: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(rel)
  } catch {
    return null
  }
  const full = normalize(join(root, decoded))
  if (!full.startsWith(normalize(root) + sep)) return null
  try {
    return statSync(full).isFile() ? full : null
  } catch {
    return null
  }
}

export function createApp(o: AppOptions): Hono {
  const app = new Hono()

  app.use('*', async (c, next) => {
    // @hono/node-server builds c.req.url from the Host header, so the URL host is the Host header
    if (!isAllowedHost(new URL(c.req.url).host, o.port()) || !isAllowedOrigin(c.req.header('origin'), o.port())) {
      return c.text('forbidden', 403)
    }
    await next()
  })

  const auth = async (c: Context, next: Next) => {
    if (c.req.header('x-sidecar-token') !== o.token) return c.text('unauthorized', 401)
    await next()
  }
  app.use('/events', auth)
  app.use('/api/*', auth)

  app.get('/health', (c) => c.json({ ok: true, name: SIDECAR_NAME, version: o.version }))

  app.post('/events', bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.text('too large', 413) }), async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.text('invalid json', 400)
    }
    const parsed = SidecarEventSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'invalid event' }, 400)
    return c.json(o.pipeline.ingest(parsed.data), 202)
  })

  app.get('/api/sessions', (c) => c.json(o.store.listSessions()))
  app.get('/api/sessions/:id/steps', (c) => {
    const id = c.req.param('id')
    const rev = o.store.revision(id)
    c.header('x-sidecar-rev', rev)
    // what the session waits on can change without a new step, so it rides along even when unchanged
    const attention = o.store.getSession(id)?.attention
    if (attention) c.header('x-sidecar-attention', attention)
    if (c.req.query('rev') === rev) return c.body(null, 304)
    return c.json(o.store.stepsForSession(id))
  })

  app.get('/api/settings', (c) => c.json(o.settings.get()))
  app.put('/api/settings', async (c) => {
    let body: unknown
    try { body = await c.req.json() } catch { return c.text('invalid json', 400) }
    const parsed = SettingsSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'invalid settings' }, 400)
    const settings = o.settings.set(parsed.data)
    o.explainer.settingsChanged()
    return c.json({ settings, explainer: o.explainer.state() })
  })
  app.get('/api/explainer', (c) => c.json(o.explainer.state()))
  app.get('/api/sessions/:id/decisions', (c) => c.json(o.store.listDecisions(c.req.param('id'))))
  app.get('/api/sessions/:id/glossary', (c) => c.json(o.store.listGlossary(c.req.param('id'))))
  app.get('/api/sessions/:id/recaps', (c) => c.json(o.store.listRecaps(c.req.param('id'))))
  // null until the scan is ready, not a 404: the workstation asks for it on every session it opens
  app.get('/api/sessions/:id/baseline', (c) => c.json(o.store.getBaseline(c.req.param('id')) ?? null))
  app.delete('/api/sessions/:id', (c) => {
    const id = c.req.param('id')
    o.store.deleteSession(id)
    o.hub.publish({ type: 'session_deleted', id })
    return c.json({ ok: true })
  })
  app.delete('/api/sessions', (c) => {
    o.store.deleteAll()
    o.hub.publish({ type: 'reset' })
    return c.json({ ok: true })
  })

  app.get('/assets/*', (c) => {
    if (!o.staticDir) return c.notFound()
    const file = safeFile(o.staticDir, c.req.path.slice(1))
    if (!file) return c.notFound()
    return c.body(readFileSync(file), 200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    })
  })

  app.get('/', (c) => {
    const index = o.staticDir ? safeFile(o.staticDir, 'index.html') : null
    if (!index) return c.html(`<!doctype html><title>${SIDECAR_NAME}</title><p>${SIDECAR_NAME} is running. Web UI not built.</p>`)
    const html = readFileSync(index, 'utf8').replace('</head>', `<meta name="sidecar-token" content="${o.token}"></head>`)
    return c.html(html)
  })

  return app
}
