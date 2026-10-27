import { app } from 'electron'
import path from 'path'
import type { Settings, SettingsPatch } from '@shared/types'
import { applySettingsPatch, defaultSettings, migrateSettings } from '@shared/settings'
import { readJson, writeJsonAtomic } from './atomicJson'

// Settings v2 live in %APPDATA%/POETH/settings.json. Defaults, the v1 -> v2
// migration and patch merging are pure functions in src/shared/settings.ts.

export { defaultSettings }

let cache: Settings | null = null

type SettingsListener = (next: Settings, patch: SettingsPatch) => void
const listeners = new Set<SettingsListener>()

/**
 * Подписка на сохранённые изменения настроек (например, команды чата перерегистрируют свои
 * хоткеи). Вызывается после записи файла; возвращает отписку.
 */
export function onSettingsChange(cb: SettingsListener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

async function load(): Promise<Settings> {
  const raw = await readJson<unknown>(settingsFile(), null)
  const loaded = migrateSettings(raw)
  cache = loaded
  // Persist a migrated v1 file once, so the on-disk format matches the code.
  const rawVersion = (raw as { schemaVersion?: unknown } | null)?.schemaVersion
  if (raw && rawVersion !== loaded.schemaVersion) {
    try {
      await writeJsonAtomic(settingsFile(), loaded)
      console.log('[settings] migrated settings.json to v' + loaded.schemaVersion)
    } catch (e) {
      console.error('[settings] failed to persist migrated settings:', e)
    }
  }
  return cache ?? loaded
}

let loading: Promise<Settings> | null = null

/**
 * Настройки (из кэша). Первые параллельные вызовы ждут ОДНО чтение файла: иначе позднее чтение
 * перезаписывало кэш поверх уже применённого патча (находка S9: «Запускать свёрнутым» не работал).
 */
export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  loading ??= load().finally(() => {
    loading = null
  })
  return loading
}

// Изменения настроек — строго по очереди: каждый патч применяется к результату предыдущего
// (без потерянных обновлений) и запись settings.json не идёт параллельно сама с собой.
let queue: Promise<unknown> = Promise.resolve()

export function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const run = async (): Promise<Settings> => {
    const next = applySettingsPatch(await getSettings(), patch)
    cache = next
    await writeJsonAtomic(settingsFile(), next)
    for (const cb of [...listeners]) {
      try {
        cb(next, patch)
      } catch (e) {
        console.error('[settings] change listener failed:', e)
      }
    }
    return next
  }
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}
