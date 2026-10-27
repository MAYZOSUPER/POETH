import { app } from 'electron'
import path from 'path'
import type { Settings, SettingsPatch } from '@shared/types'
import { applySettingsPatch, defaultSettings, migrateSettings } from '@shared/settings'
import { readJson, writeJsonAtomic } from './atomicJson'

// Settings v2 live in %APPDATA%/POETH/settings.json. Defaults, the v1 -> v2
// migration and patch merging are pure functions in src/shared/settings.ts.

export { defaultSettings }

let cache: Settings | null = null

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  const raw = await readJson<unknown>(settingsFile(), null)
  cache = migrateSettings(raw)
  // Persist a migrated v1 file once, so the on-disk format matches the code.
  const rawVersion = (raw as { schemaVersion?: unknown } | null)?.schemaVersion
  if (raw && rawVersion !== cache.schemaVersion) {
    try {
      await writeJsonAtomic(settingsFile(), cache)
      console.log('[settings] migrated settings.json to v' + cache.schemaVersion)
    } catch (e) {
      console.error('[settings] failed to persist migrated settings:', e)
    }
  }
  return cache
}

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const current = await getSettings()
  cache = applySettingsPatch(current, patch)
  await writeJsonAtomic(settingsFile(), cache)
  return cache
}
