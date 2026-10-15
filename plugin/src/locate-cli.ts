import { sidecarHome } from '@sidecar/shared/home'
import { locate } from './locate'

try {
  process.stdout.write(JSON.stringify(locate(sidecarHome())))
} catch {
  process.stdout.write('{}')
}
