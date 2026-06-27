import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { HotkeyAction, Settings } from '@shared/types'
import * as profiles from './services/profileStore'
import { getSettings, updateSettings } from './services/settingsStore'
import { loadDataset } from './services/questDataset'
import { resolveLayout } from './services/layoutResolver'
import { getOverlayWindow } from './overlayWindow'
import { setLocked } from './clickThrough'

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function broadcastActiveProfile(id: string | null): void {
  getOverlayWindow()?.webContents.send(IPC.events.activeProfileChanged, id)
}

/** Push settings-derived window state (opacity, lock, visibility). */
export function applySettingsToWindow(s: Settings): void {
  const win = getOverlayWindow()
  setLocked(s.locked)
  if (!win || win.isDestroyed()) return
  win.setOpacity(clamp(s.opacity, 0.2, 1))
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
    return next
  })

  // ---- dataset + layouts ----
  ipcMain.handle(IPC.dataset.get, () => loadDataset())
  ipcMain.handle(IPC.layout.resolve, (_e, areaId: string) => resolveLayout(areaId))

  // ---- window controls (fire-and-forget) ----
  ipcMain.on(IPC.window.setOpacity, (_e, value: number) => {
    getOverlayWindow()?.setOpacity(clamp(value, 0.2, 1))
  })
  ipcMain.on(IPC.window.setLocked, (_e, value: boolean) => setLocked(!!value))
  ipcMain.on(IPC.window.toggleVisible, () => {
    void toggleOverlayVisible()
  })
}
