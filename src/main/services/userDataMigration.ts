import { app } from 'electron'
import { existsSync, cpSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// The product was renamed twice: Act Compass -> Exile Companion -> POETH. Each
// rename moves userData (%APPDATA%/<productName>). On first start of POETH we copy
// the newest legacy folder once, so profiles/progress/settings survive. Settings
// v1 -> v2 is migrated later by the settings store.
//
// Runs at module load, BEFORE the single-instance lock and app `ready`, so the
// copy happens before Chromium starts writing its own files into userData.
// Existing files are never overwritten (force:false).

const LEGACY_NAMES = ['Exile Companion', 'Act Compass'] // newest first
const MARKER = 'migrated-from.json'

export function migrateUserData(): void {
  try {
    const current = app.getPath('userData') // %APPDATA%/POETH
    if (existsSync(join(current, MARKER)) || existsSync(join(current, 'settings.json'))) return
    for (const name of LEGACY_NAMES) {
      const legacy = join(dirname(current), name)
      if (legacy === current || !existsSync(legacy)) continue
      cpSync(legacy, current, { recursive: true, force: false, errorOnExist: false })
      mkdirSync(current, { recursive: true })
      writeFileSync(
        join(current, MARKER),
        JSON.stringify({ from: name, at: new Date().toISOString() }, null, 2)
      )
      console.log(`[migrate] userData copied from "${name}" to "${app.getName()}"`)
      return
    }
  } catch (e) {
    console.error('[migrate] userData migration failed:', e)
  }
}
