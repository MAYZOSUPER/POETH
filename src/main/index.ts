import { app, BrowserWindow } from 'electron'
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
import { registerPoethScheme, handlePoethProtocol } from './protocol'
import { migrateUserData } from './services/userDataMigration'

// Must happen before `ready` (scheme) and before the single-instance lock
// (userData copy from the old product names, before Chromium writes there).
registerPoethScheme()
migrateUserData()

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
  handlePoethProtocol()

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
