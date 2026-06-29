import { app, BrowserWindow, protocol } from 'electron'
import { promises as fs, existsSync, cpSync } from 'fs'
import { join, dirname } from 'path'
import { createOverlayWindow } from './overlayWindow'
import { initClickThrough } from './clickThrough'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { createTray, destroyTray } from './tray'
import {
  registerIpcHandlers,
  dispatchHotkey,
  applySettingsToWindow,
  wireTailer,
  reconcileTailer,
  setupBossMatcher
} from './ipcHandlers'
import { getSettings } from './services/settingsStore'
import { resolveLayoutFile, resolveBrandFile, contentTypeFor } from './services/layoutResolver'

// Privileged scheme for serving local/cached layout images to the renderer
// (works in both the dev http origin and the packaged file origin, unlike
// raw file:// URLs which are blocked by webSecurity).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'poe2img',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

// Single-instance lock — a second launch just focuses the existing overlay.
if (!app.requestSingleInstanceLock()) {
  console.log('[main] another instance holds the single-instance lock — quitting')
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })

  app.whenReady().then(bootstrap)
}

// One-time rename migration: the product was renamed Act Compass -> Exile Companion,
// which moves userData to %APPDATA%/Exile Companion. Copy the old folder once so
// existing profiles/progress/settings are preserved.
function migrateUserData(): void {
  try {
    const current = app.getPath('userData') // %APPDATA%/Exile Companion
    const legacy = join(dirname(current), 'Act Compass')
    if (legacy !== current && existsSync(legacy) && !existsSync(current)) {
      cpSync(legacy, current, { recursive: true })
      console.log('[migrate] userData copied from "Act Compass" to "Exile Companion"')
    }
  } catch (e) {
    console.error('[migrate] userData migration failed:', e)
  }
}

async function bootstrap(): Promise<void> {
  migrateUserData()
  protocol.handle('poe2img', async (request) => {
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)

      // poe2img://brand/<file>  -> resources/brand/<file>
      if (url.host === 'brand') {
        const file = segments[0]
        if (!file) return new Response('Bad request', { status: 400 })
        const abs = await resolveBrandFile(file)
        if (!abs) return new Response('Not found', { status: 404 })
        const data = await fs.readFile(abs)
        return new Response(new Uint8Array(data), {
          headers: { 'Content-Type': contentTypeFor(file) }
        })
      }

      // poe2img://img/<areaId>/<file>  -> layout image (bundled/cached/remote)
      const areaId = segments[0]
      const file = segments[1]
      if (!areaId || !file) return new Response('Bad request', { status: 400 })
      const abs = await resolveLayoutFile(areaId, file)
      if (!abs) return new Response('Not found', { status: 404 })
      const data = await fs.readFile(abs)
      return new Response(new Uint8Array(data), {
        headers: { 'Content-Type': contentTypeFor(file) }
      })
    } catch {
      return new Response('Error', { status: 500 })
    }
  })

  registerIpcHandlers()
  wireTailer()
  void setupBossMatcher()
  createOverlayWindow()

  const settings = await getSettings()
  initClickThrough(settings.locked)
  applySettingsToWindow(settings)
  registerHotkeys(settings.hotkeys, dispatchHotkey)
  await reconcileTailer(settings)
  void createTray()
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  unregisterHotkeys()
  destroyTray()
})
