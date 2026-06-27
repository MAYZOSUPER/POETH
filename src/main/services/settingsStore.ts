import { app } from 'electron'
import path from 'path'
import type { Settings } from '@shared/types'
import { readJson, writeJsonAtomic } from './atomicJson'

const SETTINGS_VERSION = 1

export function defaultSettings(): Settings {
  return {
    schemaVersion: SETTINGS_VERSION,
    activeProfileId: null,
    opacity: 0.95,
    locked: false,
    overlayVisible: true,
    clickThroughPollMs: 33,
    logPath: null,
    tailerEnabled: false,
    autoAdvanceZone: true,
    autoCheckQuests: false,
    hotkeys: {
      toggleVisible: 'Control+Shift+O',
      toggleLock: 'Control+Shift+L',
      prevStep: 'Control+Shift+[',
      nextStep: 'Control+Shift+]'
    }
  }
}

let cache: Settings | null = null

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function migrate(s: Settings): Settings {
  const base = defaultSettings()
  const merged: Settings = {
    ...base,
    ...s,
    hotkeys: { ...base.hotkeys, ...(s.hotkeys ?? {}) }
  }
  merged.schemaVersion = SETTINGS_VERSION
  return merged
}

export async function getSettings(): Promise<Settings> {
  if (cache) return cache
  const loaded = await readJson<Settings>(settingsFile(), defaultSettings())
  cache = migrate(loaded)
  return cache
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  cache = {
    ...current,
    ...patch,
    hotkeys: { ...current.hotkeys, ...(patch.hotkeys ?? {}) }
  }
  await writeJsonAtomic(settingsFile(), cache)
  return cache
}
