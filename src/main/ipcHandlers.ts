import { ipcMain, dialog } from 'electron'
import { IPC } from '@shared/ipc'
import type { HotkeyAction, LevelEvent, Settings, TailerStatus, ZoneEvent } from '@shared/types'
import * as profiles from './services/profileStore'
import { getSettings, updateSettings } from './services/settingsStore'
import { loadDataset } from './services/questDataset'
import { resolveLayout } from './services/layoutResolver'
import { logTailer } from './services/logTailer'
import { getOverlayWindow } from './overlayWindow'
import { setLocked } from './clickThrough'

function send(channel: string, payload: unknown): void {
  getOverlayWindow()?.webContents.send(channel, payload)
}

/** Start/stop the log tailer to match the current settings. */
export async function reconcileTailer(s: Settings): Promise<void> {
  if (s.tailerEnabled) await logTailer.start(s.logPath)
  else logTailer.stop()
}

/** Forward tailer events to the renderer (subscribe once at startup). */
export function wireTailer(): void {
  const dbg = process.env.OVERLAY_DEBUG === '1'
  logTailer.on('zone', (e: ZoneEvent) => {
    if (dbg) console.log('[tailer] zone', JSON.stringify(e))
    send(IPC.events.zoneChange, e)
  })
  logTailer.on('level', (e: LevelEvent) => {
    if (dbg) console.log('[tailer] level', JSON.stringify(e))
    send(IPC.events.levelChange, e)
  })
  logTailer.on('status', (s: TailerStatus) => {
    if (dbg) console.log('[tailer] status', JSON.stringify(s))
    send(IPC.events.tailerStatus, s)
  })
}

function broadcastActiveProfile(id: string | null): void {
  getOverlayWindow()?.webContents.send(IPC.events.activeProfileChanged, id)
}

/** Push settings-derived window state (lock, visibility). Opacity is applied in
 * the renderer via CSS — native setOpacity is unstable on transparent windows. */
export function applySettingsToWindow(s: Settings): void {
  const win = getOverlayWindow()
  setLocked(s.locked)
  if (!win || win.isDestroyed()) return
  if (s.overlayVisible && !win.isVisible()) win.show()
  if (!s.overlayVisible && win.isVisible()) win.hide()
}

async function toggleOverlayVisible(): Promise<void> {
  const win = getOverlayWindow()
  if (!win || win.isDestroyed()) return
  const next = !win.isVisible()
  if (next) win.show()
  else win.hide()
  await updateSettings({ overlayVisible: next })
}

/** Global-hotkey dispatcher: perform main-side effects and forward to renderer. */
export async function dispatchHotkey(action: HotkeyAction): Promise<void> {
  if (action === 'toggleVisible') {
    await toggleOverlayVisible()
  } else if (action === 'toggleLock') {
    const s = await getSettings()
    const next = await updateSettings({ locked: !s.locked })
    setLocked(next.locked)
  }
  // Always forward so the renderer can update UI (step navigation, lock badge).
  getOverlayWindow()?.webContents.send(IPC.events.hotkey, action)
}

export function registerIpcHandlers(): void {
  // ---- profiles ----
  ipcMain.handle(IPC.profiles.list, () => profiles.listProfiles())
  ipcMain.handle(IPC.profiles.create, (_e, name: string, className?: string) =>
    profiles.createProfile(name, className)
  )
  ipcMain.handle(IPC.profiles.rename, (_e, id: string, name: string) =>
    profiles.renameProfile(id, name)
  )
  ipcMain.handle(IPC.profiles.delete, (_e, id: string) => profiles.deleteProfile(id))
  ipcMain.handle(IPC.profiles.setActive, async (_e, id: string) => {
    await updateSettings({ activeProfileId: id })
    broadcastActiveProfile(id)
  })
  ipcMain.handle(IPC.profiles.getActive, async () => (await getSettings()).activeProfileId)

  // ---- progress ----
  ipcMain.handle(IPC.progress.get, (_e, pid: string) => profiles.getProgress(pid))
  ipcMain.handle(IPC.progress.setQuestDone, (_e, pid: string, qid: string, done: boolean) =>
    profiles.setQuestDone(pid, qid, done)
  )
  ipcMain.handle(IPC.progress.setAct, (_e, pid: string, act: number) => profiles.setAct(pid, act))
  ipcMain.handle(IPC.progress.setLevel, (_e, pid: string, level: number) =>
    profiles.setLevel(pid, level)
  )
  ipcMain.handle(IPC.progress.setRewardChoice, (_e, pid: string, qid: string, idx: number) =>
    profiles.setRewardChoice(pid, qid, idx)
  )

  // ---- settings ----
  ipcMain.handle(IPC.settings.get, () => getSettings())
  ipcMain.handle(IPC.settings.set, async (_e, patch: Partial<Settings>) => {
    const next = await updateSettings(patch)
    applySettingsToWindow(next)
    if ('tailerEnabled' in patch || 'logPath' in patch) await reconcileTailer(next)
    return next
  })

  // ---- dataset + layouts ----
  ipcMain.handle(IPC.dataset.get, () => loadDataset())
  ipcMain.handle(IPC.layout.resolve, (_e, areaId: string) => resolveLayout(areaId))

  // ---- log tailer (advisory zone/level auto-detect) ----
  ipcMain.handle(IPC.tailer.start, async () => {
    const next = await updateSettings({ tailerEnabled: true })
    return logTailer.start(next.logPath)
  })
  ipcMain.handle(IPC.tailer.stop, async () => {
    await updateSettings({ tailerEnabled: false })
    logTailer.stop()
    return logTailer.getStatus()
  })
  ipcMain.handle(IPC.tailer.status, () => logTailer.getStatus())
  ipcMain.handle(IPC.tailer.pickLogFile, async () => {
    const win = getOverlayWindow()
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Выберите Client.txt',
          properties: ['openFile'],
          filters: [{ name: 'Client log', extensions: ['txt'] }]
        })
      : await dialog.showOpenDialog({
          title: 'Выберите Client.txt',
          properties: ['openFile'],
          filters: [{ name: 'Client log', extensions: ['txt'] }]
        })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const next = await updateSettings({ logPath: path, tailerEnabled: true })
    await logTailer.start(next.logPath)
    return path
  })

  // ---- window controls (fire-and-forget) ----
  ipcMain.on(IPC.window.setLocked, (_e, value: boolean) => setLocked(!!value))
  ipcMain.on(IPC.window.toggleVisible, () => {
    void toggleOverlayVisible()
  })
  ipcMain.on(IPC.window.minimize, () => getOverlayWindow()?.minimize())
}
