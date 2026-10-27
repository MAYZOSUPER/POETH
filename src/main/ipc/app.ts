import { app, ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'
import { isGameId, type GameId } from '@shared/games'
import type { AppInfo, Settings, SettingsPatch } from '@shared/types'
import { getSettings, updateSettings } from '../services/settingsStore'
import { getCompanionWindow } from '../windows/companionWindow'
import { setLocked } from '../clickThrough'
import { onHotkeyAction, registerHotkeys, unregisterHotkeys } from '../hotkeys'
import { getRunningGame, isDevServer } from '../gameContext'
import { reconcileTailer } from './campaign'
import type { IpcDomain } from './types'

// Домен «приложение»: настройки, окно компаньона, хоткеи, смена игры.

/** Push settings-derived window state (lock, visibility). Opacity is applied in
 * the renderer via CSS — native setOpacity is unstable on transparent windows. */
export function applySettingsToWindow(s: Settings): void {
  const win = getCompanionWindow()
  setLocked(s.locked)
  if (!win || win.isDestroyed()) return
  win.setSkipTaskbar(!s.showInTaskbar)
  if (s.overlayVisible && !win.isVisible()) win.show()
  if (!s.overlayVisible && win.isVisible()) win.hide()
}

export async function toggleCompanionVisible(): Promise<void> {
  const win = getCompanionWindow()
  if (!win || win.isDestroyed()) return
  const next = !win.isVisible()
  if (next) win.show()
  else win.hide()
  await updateSettings({ overlayVisible: next })
}

export async function toggleLock(): Promise<void> {
  const s = await getSettings()
  const next = await updateSettings({ locked: !s.locked })
  setLocked(next.locked)
}

/** Перезапуск под другую игру — передаётся из ipc/index.ts (мягкий перезапуск в dev). */
let softRestart: ((game: GameId) => Promise<void>) | null = null
export function setSoftRestart(fn: (game: GameId) => Promise<void>): void {
  softRestart = fn
}

async function switchGame(game: GameId): Promise<void> {
  if (game === getRunningGame()) return
  await updateSettings({ game })
  if (isDevServer() && softRestart) {
    // electron-vite dev завершает dev-сервер, когда процесс Electron выходит
    // (ps.on('close', process.exit)) — app.relaunch() дал бы пустое окно.
    // Поэтому в dev — мягкий перезапуск: домены настраиваются заново, окна перезагружаются.
    await softRestart(game)
    return
  }
  app.relaunch()
  app.exit(0)
}

function register(): void {
  // ---- settings ----
  ipcMain.handle(IPC.settings.get, () => getSettings())
  ipcMain.handle(IPC.settings.set, async (_e, raw: SettingsPatch) => {
    // the game is switched only via app.switchGame (needs a relaunch)
    const { game: _ignored, ...patch } = raw ?? {}
    const next = await updateSettings(patch)
    applySettingsToWindow(next)
    if ('tailerEnabled' in patch || 'logPath' in patch) await reconcileTailer(next)
    if ('hotkeys' in patch) registerHotkeys(next.hotkeys)
    return next
  })

  // ---- app ----
  ipcMain.handle(
    IPC.app.info,
    (): AppInfo => ({ game: getRunningGame(), version: app.getVersion(), isDev: isDevServer() })
  )
  ipcMain.handle(IPC.app.switchGame, async (_e, game: unknown) => {
    if (isGameId(game)) await switchGame(game)
  })

  // ---- window controls (fire-and-forget) ----
  ipcMain.on(IPC.window.setLocked, (_e, value: boolean) => setLocked(!!value))
  ipcMain.on(IPC.window.toggleVisible, () => {
    void toggleCompanionVisible()
  })
  ipcMain.on(IPC.window.minimize, () => getCompanionWindow()?.minimize())
  ipcMain.on(IPC.window.openExternal, (_e, url: string) => {
    // Only ever open https links to the official site (www / ru).
    if (typeof url !== 'string') return
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') return
      const host = parsed.hostname
      if (host !== 'www.pathofexile.com' && host !== 'ru.pathofexile.com' && host !== 'pathofexile.com') {
        return
      }
      void shell.openExternal(url)
    } catch {
      // malformed URL — ignore
    }
  })

  // ---- hotkey rebinding: suspend globals while the user captures a combo ----
  ipcMain.on(IPC.hotkeys.suspend, () => unregisterHotkeys())
  ipcMain.on(IPC.hotkeys.resume, () => {
    void getSettings().then((s) => registerHotkeys(s.hotkeys))
  })
}

function setupForGame(): void {
  onHotkeyAction('toggleCompanion', toggleCompanionVisible)
  onHotkeyAction('toggleLock', toggleLock)
}

export const appDomain: IpcDomain = { register, setupForGame }
