import { ipcMain, dialog } from 'electron'
import { promises as fs } from 'fs'
import { IPC } from '@shared/ipc'
import type {
  BossDefeatEvent,
  HotkeyAction,
  LevelEvent,
  Settings,
  TailerStatus,
  ZoneEvent
} from '@shared/types'
import * as profiles from './services/profileStore'
import { getSettings, updateSettings } from './services/settingsStore'
import { loadDataset } from './services/questDataset'
import { buildBossIndex } from './services/bossMatcher'
import { resolveLayout } from './services/layoutResolver'
import { logTailer } from './services/logTailer'
import { getOverlayWindow } from './overlayWindow'
import { setLocked } from './clickThrough'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'

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
  logTailer.on('boss', (e: BossDefeatEvent) => {
    if (dbg) console.log('[tailer] boss', JSON.stringify(e))
    send(IPC.events.bossDefeat, e)
  })
}

/** Build the boss-name index (bilingual) from the dataset and inject it into the tailer. */
export async function setupBossMatcher(): Promise<void> {
  const ds = await loadDataset()
  logTailer.setBossIndex(buildBossIndex(ds))
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
  win.setSkipTaskbar(!s.showInTaskbar)
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
  ipcMain.handle(IPC.profiles.setClass, (_e, id: string, className: string) =>
    profiles.setProfileClass(id, className)
  )
  ipcMain.handle(IPC.profiles.delete, (_e, id: string) => profiles.deleteProfile(id))
  ipcMain.handle(IPC.profiles.setActive, async (_e, id: string) => {
    await updateSettings({ activeProfileId: id })
    broadcastActiveProfile(id)
  })
  ipcMain.handle(IPC.profiles.getActive, async () => (await getSettings()).activeProfileId)
  ipcMain.handle(IPC.profiles.export, async (_e, id: string) => {
    const bundle = await profiles.getProfileBundle(id)
    if (!bundle) return { status: 'error' as const }
    const win = getOverlayWindow()
    const safeName = bundle.profile.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'profile'
    const opts = {
      title: 'Экспорт профиля',
      defaultPath: `${safeName}.actcompass.json`,
      filters: [{ name: 'Act Compass profile', extensions: ['json'] }]
    }
    const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (result.canceled || !result.filePath) return { status: 'canceled' as const }
    try {
      await fs.writeFile(result.filePath, JSON.stringify(bundle, null, 2), 'utf8')
    } catch {
      return { status: 'error' as const }
    }
    return { status: 'saved' as const, path: result.filePath }
  })
  ipcMain.handle(IPC.profiles.import, async () => {
    const win = getOverlayWindow()
    const opts = {
      title: 'Импорт профиля',
      properties: ['openFile' as const],
      filters: [{ name: 'Act Compass profile', extensions: ['json'] }]
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return { status: 'canceled' as const }
    let raw: unknown
    try {
      const text = await fs.readFile(result.filePaths[0], 'utf8')
      raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    } catch {
      return { status: 'invalid' as const }
    }
    const meta = await profiles.importProfileBundle(raw)
    if (!meta) return { status: 'invalid' as const }
    return { status: 'created' as const, profile: meta, profiles: await profiles.listProfiles() }
  })

  // ---- progress ----
  ipcMain.handle(IPC.progress.get, (_e, pid: string) => profiles.getProgress(pid))
  ipcMain.handle(IPC.progress.setQuestDone, (_e, pid: string, qid: string, done: boolean) =>
    profiles.setQuestDone(pid, qid, done)
  )
  ipcMain.handle(IPC.progress.setQuestsDone, (_e, pid: string, qids: string[]) =>
    profiles.setQuestsDone(pid, qids)
  )
  ipcMain.handle(IPC.progress.setManyQuests, (_e, pid: string, qids: string[], done: boolean) =>
    profiles.setManyQuests(pid, qids, done)
  )
  ipcMain.handle(IPC.progress.setAct, (_e, pid: string, act: number) => profiles.setAct(pid, act))
  ipcMain.handle(IPC.progress.setLevel, (_e, pid: string, level: number) =>
    profiles.setLevel(pid, level)
  )
  ipcMain.handle(IPC.progress.setRewardChoice, (_e, pid: string, qid: string, idx: number) =>
    profiles.setRewardChoice(pid, qid, idx)
  )
  ipcMain.handle(IPC.progress.setTrialDone, (_e, pid: string, tid: string, done: boolean) =>
    profiles.setTrialDone(pid, tid, done)
  )
  ipcMain.handle(IPC.progress.setAscendancy, (_e, pid: string, ascId: string | null) =>
    profiles.setAscendancy(pid, ascId)
  )

  // ---- settings ----
  ipcMain.handle(IPC.settings.get, () => getSettings())
  ipcMain.handle(IPC.settings.set, async (_e, patch: Partial<Settings>) => {
    const next = await updateSettings(patch)
    applySettingsToWindow(next)
    if ('tailerEnabled' in patch || 'logPath' in patch) await reconcileTailer(next)
    if ('hotkeys' in patch) registerHotkeys(next.hotkeys, dispatchHotkey)
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

  // ---- hotkey rebinding: suspend globals while the user captures a combo ----
  ipcMain.on(IPC.hotkeys.suspend, () => unregisterHotkeys())
  ipcMain.on(IPC.hotkeys.resume, () => {
    void getSettings().then((s) => registerHotkeys(s.hotkeys, dispatchHotkey))
  })
}
