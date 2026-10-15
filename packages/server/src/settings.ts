import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from '@sidecar/shared'

export interface SettingsStore {
  get(): Settings
  set(s: Settings): Settings
}

export function memorySettings(initial: Settings = DEFAULT_SETTINGS): SettingsStore {
  let cur = { ...initial }
  return { get: () => ({ ...cur }), set: (s) => (cur = { ...s }, { ...cur }) }
}

export function fileSettings(home: string): SettingsStore {
  const file = join(home, 'settings.json')
  const load = (): Settings => {
    try {
      const parsed = SettingsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }
  let cur = load()
  return {
    get: () => ({ ...cur }),
    set(s) {
      const tmp = `${file}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(s), { mode: 0o600 })
      renameSync(tmp, file)
      cur = { ...s }
      return { ...cur }
    },
  }
}
