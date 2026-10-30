import { dialog, ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { LootFilterLink, LootFilterState } from '@shared/types/lootFilter'
import { linkUrl } from '@shared/lootFilter/source'
import { getLootFilterData } from '../lootFilter/store'
import {
  checkLatest,
  folderOf,
  getLootFilterState,
  installLootFilter,
  markNotified,
  setLootFilterDir,
  setLootFilterEnabled,
  setLootFilterPrefs
} from '../lootFilter/service'
import { getCompanionWindow, sendToCompanion } from '../windows/companionWindow'
import { notifyUser } from '../services/notify'
import { uiLang } from '../services/dialogText'
import type { IpcDomain } from './types'

// Домен «Фильтр лута» (main, S53): фильтр NeverSink для PoE 1 в один клик. Только PoE 1 (в PoE 2 каналы отвечают
// выключенным состоянием и ничего не делают). Сеть — api.github.com и codeload.github.com (lootFilter/fetch.ts),
// диск — свои POETH-NeverSink-<уровень>.filter в папке фильтров игры (lootFilter/install.ts).
// Фоновая проверка новой версии — только с галочкой «Проверять» и не чаще раза в сутки; при открытом экране —
// тоже раз в сутки. Новую версию с галочкой напоминаем один раз уведомлением, ставим — только по кнопке.

const LINKS: readonly LootFilterLink[] = ['repo', 'license', 'release', 'filterblade']
/** Первая фоновая проверка — через 2 минуты после запуска, дальше будильник раз в 3 часа (сутки решает shouldCheck). */
const FIRST_TICK_MS = 2 * 60_000
const TICK_MS = 3 * 60 * 60_000

let firstTick: ReturnType<typeof setTimeout> | null = null
let everyTick: ReturnType<typeof setInterval> | null = null

function push(state: LootFilterState): LootFilterState {
  sendToCompanion(IPC.events.lootFilterState, state)
  return state
}

async function backgroundCheck(): Promise<void> {
  const { state, newTag } = await checkLatest(false)
  push(state)
  if (newTag) {
    await markNotified(newTag)
    await notifyUser('lootFilterUpdate', { version: newTag })
  }
}

function stopTimers(): void {
  if (firstTick) clearTimeout(firstTick)
  if (everyTick) clearInterval(everyTick)
  firstTick = null
  everyTick = null
}

function startTimers(): void {
  stopTimers()
  const tick = (): void => void backgroundCheck().catch(() => undefined)
  firstTick = setTimeout(tick, FIRST_TICK_MS)
  everyTick = setInterval(tick, TICK_MS)
}

const PICK_TITLE = { ru: 'Папка фильтров Path of Exile', en: 'Path of Exile filter folder' } as const

function register(): void {
  ipcMain.handle(IPC.lootFilter.state, () => getLootFilterState())
  ipcMain.handle(IPC.lootFilter.screenOpened, async () => push((await checkLatest(true)).state))
  ipcMain.handle(IPC.lootFilter.install, async (_e, req: unknown) => {
    const res = await installLootFilter(req)
    push(res.state)
    return res
  })
  ipcMain.handle(IPC.lootFilter.setPrefs, async (_e, prefs: unknown) => push(await setLootFilterPrefs(prefs)))
  ipcMain.handle(IPC.lootFilter.pickFolder, async () => {
    const st = await getLootFilterState()
    if (!st.on) return st
    const win = getCompanionWindow()
    const opts: Electron.OpenDialogOptions = {
      title: PICK_TITLE[await uiLang()],
      defaultPath: st.folder.path,
      properties: ['openDirectory', 'dontAddToRecent']
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || r.filePaths.length === 0) return st
    return push(await setLootFilterDir(r.filePaths[0]))
  })
  ipcMain.handle(IPC.lootFilter.resetFolder, async () => push(await setLootFilterDir(null)))
  ipcMain.handle(IPC.lootFilter.openFolder, async () => {
    const folder = folderOf(await getLootFilterData())
    if (folder.found) await shell.openPath(folder.path)
  })
  ipcMain.handle(IPC.lootFilter.openLink, async (_e, link: unknown) => {
    if (!LINKS.includes(link as LootFilterLink)) return
    const url = linkUrl(link as LootFilterLink, (await getLootFilterData()).latest?.tag)
    if (url) await shell.openExternal(url)
  })
}

function setupForGame(def: GameDef): void {
  const on = def.id === 'poe1'
  setLootFilterEnabled(on)
  if (on) startTimers()
  else stopTimers()
}

export const lootFilterDomain: IpcDomain = { register, setupForGame }
