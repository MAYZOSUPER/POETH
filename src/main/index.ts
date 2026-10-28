import { app, BrowserWindow } from 'electron'
import { createCompanionWindow, getCompanionWindow } from './windows/companionWindow'
import { initClickThrough } from './clickThrough'
import { unregisterHotkeys } from './hotkeys'
import { createTray, destroyTray } from './tray'
import { registerIpcHandlers, setupGame, applySettingsToWindow } from './ipc'
import { getSettings, updateSettings } from './services/settingsStore'
import { registerPoethScheme, handlePoethProtocol } from './protocol'
import { migrateUserData } from './services/userDataMigration'
import { initNetIdentity } from './net/session'
import { refreshLeagues } from './net/leagues'
import { decideStartup } from '@shared/updates'
import { closeSplash, openSplash } from './windows/serviceWindows'
import { announceStarted, applyLoginItem, setStartupStep, wasAutostarted } from './services/startup'
import { startAppUpdates } from './services/appUpdater'
import { startDataUpdates } from './services/dataUpdater'

// dev/test: isolated profile (migration tests, parallel `npm run dev` from several
// worktrees — the single-instance lock is per userData dir).
if (process.env.POETH_USER_DATA_DIR) app.setPath('userData', process.env.POETH_USER_DATA_DIR)

// Сеть (S3): один UA у окон и API (cf_clearance привязан к UA) и
// disable-blink-features=AutomationControlled — до ready и до создания окон.
initNetIdentity()

// Уведомления Windows (live S6, тост запуска S10a) от имени POETH, а не electron.app.Electron; до ready,
// чтобы первое уведомление уже шло с этим AUMID. Установленная версия: ярлык NSIS «POE Trade Helper» несёт
// AUMID = appId — в шапке тоста его имя и значок. Dev (electron.exe): свой AUMID, чтобы тосты не смешивались
// с установленной копией и Windows группировал их отдельно.
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? 'com.poeth.app' : 'com.poeth.app.dev')

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

/** Лиги PoE1 для экрана загрузки: ждём не дольше timeoutMs (без сети — дальше без них). */
async function warmLeagues(timeoutMs: number): Promise<void> {
  await Promise.race([refreshLeagues().catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))])
}

async function bootstrap(): Promise<void> {
  handlePoethProtocol()

  registerIpcHandlers()
  const initial = await getSettings()
  // Как APT/Sidekick (S10a): POETH живёт в трее; экран загрузки — при ручном запуске;
  // окно компаньона само открывается только в первый раз (или если снят «Запускать свёрнутым»)
  const plan = decideStartup({
    firstRun: !initial.startup.firstRunDone,
    autostarted: wasAutostarted(),
    minimized: initial.startup.minimized,
    game: initial.game
  })
  if (plan.splash) openSplash()
  console.log(`[startup] splash=${plan.splash} companion=${plan.showCompanion ? 'shown' : 'hidden'}`)
  setStartupStep('settings')
  // overlayVisible — состояние окна компаньона (его же применяет applySettingsToWindow).
  // startup.firstRunDone ставит мастер первого запуска (S9: «Готово»/«Пропустить»), не main:
  // пока мастер не пройден, компаньон открывается при каждом запуске.
  const settings = await updateSettings({ overlayVisible: plan.showCompanion })
  createCompanionWindow({ show: plan.showCompanion })

  initClickThrough(settings.locked)
  applySettingsToWindow(settings)
  setStartupStep('data')
  // The game is fixed for the lifetime of the process (switching = relaunch).
  // Здесь же поднимается игровой оверлей и отслеживание фокуса игры (S1):
  // overlayDomain.setupForGame → initGameOverlay(def) — attach к окну GameDef.windowTitle.
  await setupGame(settings.game)
  if (settings.game === 'poe1') {
    setStartupStep('leagues')
    await warmLeagues(3000)
  }
  void createTray()
  applyLoginItem(settings)
  setStartupStep('ready')
  await closeSplash()
  void announceStarted(settings)
  // обновления приложения (раз в 6 ч) и данных (раз в сутки) — тихо в фоне;
  // POETH_UPDATE_DELAY_MS — первая проверка раньше (проверка с тестовым сервером)
  const delay = Number(process.env.POETH_UPDATE_DELAY_MS) || undefined
  startAppUpdates(delay)
  startDataUpdates(delay)
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
