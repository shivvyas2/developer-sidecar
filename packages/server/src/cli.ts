import { dirname, join } from 'node:path'
import { logLine, sidecarHome } from '@sidecar/shared/home'
import { startServer } from './main'
import { portFromEnv } from './port-env'

const home = sidecarHome()
const preferredPort = portFromEnv(process.env)
startServer({ home, staticDir: join(dirname(process.argv[1] ?? '.'), 'web'), ...(preferredPort ? { preferredPort } : {}) })
  .then((s) => {
    const stop = () => void s.close().then(() => process.exit(0))
    process.on('SIGTERM', stop)
    process.on('SIGINT', stop)
  })
  .catch((err: Error) => {
    if (err.message !== 'already running') logLine(home, 'server.log', `failed: ${err.stack ?? err.message}`)
    process.exit(0)
  })
