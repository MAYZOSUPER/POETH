import { app, BrowserWindow } from 'electron'
import { createCompanionWindow, getCompanionWindow } from './windows/companionWindow'
import { initClickThrough } from './clickThrough'
import { unregisterHotkeys } from './hotkeys'
import { createTray, destroyTray } from './tray'
import { registerIpcHandlers, setupGame, applySettingsToWindow } from './ipc'
import { getSettings } from './services/settingsStore'
import { registerPoethScheme, handlePoethProtocol } from './protocol'
import { migrateUserData } from './services/userDataMigration'

// dev/test: isolated profile (migration tests, parallel `npm run dev` from several
// worktrees — the single-instance lock is per userData dir).
if (process.env.POETH_USER_DATA_DIR) app.setPath('userData', process.env.POETH_USER_DATA_DIR)

// Must happen before `ready` (scheme) and before the single-instance lock
// (userData copy from the old product names, before Chromium writes there).
registerPoethScheme()
migrateUserData()

// Single-instance lock — a second launch just focuses the existing companion window.
if (!app.requestSingleInstanceLock()) {
  console.log('[main] another instance holds the single-instance lock — quitting')
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getCompanionWindow()
    if (win) {
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })

  app.whenReady().then(bootstrap)
}

async function bootstrap(): Promise<void> {
  handlePoethProtocol()

  const settings = await getSettings()
  registerIpcHandlers()
  createCompanionWindow()

  initClickThrough(settings.locked)
  applySettingsToWindow(settings)
  // The game is fixed for the lifetime of the process (switching = relaunch).
  await setupGame(settings.game)
  void createTray()
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createCompanionWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  unregisterHotkeys()
  destroyTray()
})
