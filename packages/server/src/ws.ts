import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ServerMessage } from '@sidecar/shared'
import { isAllowedHost, isAllowedOrigin } from './app'
import type { Hub } from './hub'
import type { Store } from './store'

export function attachWs(server: Server, o: { hub: Hub; store: Store; token: string; port: () => number }) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const ok = url.pathname === '/ws'
      && isAllowedHost(req.headers.host, o.port())
      && isAllowedOrigin(req.headers.origin, o.port())
      && url.searchParams.get('token') === o.token
    if (!ok) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const after = Number(url.searchParams.get('after') ?? 0) || 0
      const send = (m: ServerMessage) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
      }
      for (const step of o.store.stepsAfter(after)) send({ type: 'step', step })
      const unsubscribe = o.hub.subscribe(send)
      ws.on('close', unsubscribe)
      ws.on('error', unsubscribe)
    })
  })

  return {
    clientCount: () => wss.clients.size,
    close: () => {
      for (const c of wss.clients as Set<WebSocket>) c.terminate()
      wss.close()
    },
  }
}
