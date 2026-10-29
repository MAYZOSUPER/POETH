import { ipcMain, dialog } from 'electron'
import { promises as fs } from 'fs'
import { IPC } from '@shared/ipc'
import type { BossDefeatEvent, LevelEvent, Settings, TailerStatus, ZoneEvent } from '@shared/types'
import type { GameDef } from '@shared/games'
import * as profiles from '../services/profileStore'
import { getSettings, updateSettings } from '../services/settingsStore'
import { loadDataset } from '../services/questDataset'
import { buildBossIndex } from '../services/bossMatcher'
import { resolveLayout } from '../services/layoutResolver'
import { logTailer } from '../services/logTailer'
import { getCompanionWindow, sendToCompanion } from '../windows/companionWindow'
import { onHotkeyAction } from '../hotkeys'
import { getRunningGameDef } from '../gameContext'
import type { IpcDomain } from './types'
import { readImportJson } from '../services/importFile'

/** Файл профиля кампании — прогресс по квестам, десятки КБ; размер проверяется до чтения (S29). */
const PROFILE_IMPORT_MAX_BYTES = 1024 * 1024

// Домен «кампания PoE2» (компас): профили, прогресс, датасет, лейауты, тейлер лога.
// Работает только когда у запущенной игры features.campaign (PoE2).

/** Start/stop the log tailer to match the current settings (campaign games only). */
export async function reconcileTailer(s: Settings): Promise<void> {
  if (s.tailerEnabled && getRunningGameDef().features.campaign) await logTailer.start(s.logPath)
  else logTailer.stop()
}

let tailerWired = false

/** Forward tailer events to the renderer (subscribe once at startup). */
function wireTailer(): void {
  if (tailerWired) return
  tailerWired = true
  const dbg = process.env.OVERLAY_DEBUG === '1'
  logTailer.on('zone', (e: ZoneEvent) => {
    if (dbg) console.log('[tailer] zone', JSON.stringify(e))
    sendToCompanion(IPC.events.zoneChange, e)
  })
  logTailer.on('level', (e: LevelEvent) => {
    if (dbg) console.log('[tailer] level', JSON.stringify(e))
    sendToCompanion(IPC.events.levelChange, e)
  })
  logTailer.on('status', (s: TailerStatus) => {
    if (dbg) console.log('[tailer] status', JSON.stringify(s))
    sendToCompanion(IPC.events.tailerStatus, s)
  })
  logTailer.on('boss', (e: BossDefeatEvent) => {
    if (dbg) console.log('[tailer] boss', JSON.stringify(e))
    sendToCompanion(IPC.events.bossDefeat, e)
  })
}

/** Build the boss-name index (bilingual) from the dataset and inject it into the tailer. */
async function setupBossMatcher(): Promise<void> {
  const ds = await loadDataset()
  logTailer.setBossIndex(buildBossIndex(ds))
}

function register(): void {
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
    sendToCompanion(IPC.events.activeProfileChanged, id)
  })
  ipcMain.handle(IPC.profiles.getActive, async () => (await getSettings()).activeProfileId)
  ipcMain.handle(IPC.profiles.export, async (_e, id: string) => {
    const bundle = await profiles.getProfileBundle(id)
    if (!bundle) return { status: 'error' as const }
    const win = getCompanionWindow()
    const safeName = bundle.profile.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'profile'
    const opts = {
      title: 'Экспорт профиля',
      defaultPath: `${safeName}.poeth.json`,
      filters: [{ name: 'POETH profile', extensions: ['json'] }]
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
    const win = getCompanionWindow()
    const opts = {
      title: 'Импорт профиля',
      properties: ['openFile' as const],
      filters: [{ name: 'POETH profile', extensions: ['json'] }]
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return { status: 'canceled' as const }
    const raw = await readImportJson(result.filePaths[0], PROFILE_IMPORT_MAX_BYTES)
    if (raw === undefined) return { status: 'invalid' as const }
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

  // ---- dataset + layouts ----
  ipcMain.handle(IPC.dataset.get, () => loadDataset())
  ipcMain.handle(IPC.layout.resolve, (_e, areaId: string) => resolveLayout(areaId))

  // ---- log tailer (advisory zone/level auto-detect) ----
  ipcMain.handle(IPC.tailer.start, async () => {
    const next = await updateSettings({ tailerEnabled: true })
    if (!getRunningGameDef().features.campaign) return logTailer.getStatus()
    return logTailer.start(next.logPath)
  })
  ipcMain.handle(IPC.tailer.stop, async () => {
    await updateSettings({ tailerEnabled: false })
    logTailer.stop()
    return logTailer.getStatus()
  })
  ipcMain.handle(IPC.tailer.status, () => logTailer.getStatus())
  ipcMain.handle(IPC.tailer.pickLogFile, async () => {
    const win = getCompanionWindow()
    const opts = {
      title: 'Выберите Client.txt',
      properties: ['openFile' as const],
      filters: [{ name: 'Client log', extensions: ['txt'] }]
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const next = await updateSettings({ logPath: path, tailerEnabled: true })
    await reconcileTailer(next)
    return path
  })

  wireTailer()
  void setupBossMatcher()
}

async function setupForGame(def: GameDef): Promise<void> {
  if (def.features.campaign) {
    // step navigation is handled in the renderer (forwarded via event:hotkey)
    onHotkeyAction('prevStep', () => undefined)
    onHotkeyAction('nextStep', () => undefined)
  }
  await reconcileTailer(await getSettings())
}

export const campaignDomain: IpcDomain = { register, setupForGame }
