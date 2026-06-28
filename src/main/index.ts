import { app, BrowserWindow, protocol } from 'electron'
import { promises as fs } from 'fs'
import { createOverlayWindow } from './overlayWindow'
import { initClickThrough } from './clickThrough'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { createTray, destroyTray } from './tray'
import {
  registerIpcHandlers,
  dispatchHotkey,
  applySettingsToWindow,
  wireTailer,
  reconcileTailer
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

async function bootstrap(): Promise<void> {
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
