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
  lootFilterGame,
  markNotified,
  setLootFilterDir,
  setLootFilterGame,
  setLootFilterPrefs
} from '../lootFilter/service'
import { getCompanionWindow, sendToCompanion } from '../windows/companionWindow'
import { notifyUser } from '../services/notify'
import { uiLang } from '../services/dialogText'
import { getSettings } from '../services/settingsStore'
import { resolveGameLang } from '@shared/gameLang'
import type { IpcDomain } from './types'

// Домен «Фильтр лута» (main, S53): фильтр NeverSink в один клик. S64: для PoE 1 и PoE 2 — у каждой игры свой
// репозиторий NeverSink, папка фильтров и файл состояния (lootFilter/service.ts по игре режима).
// Сеть — api.github.com и codeload.github.com (lootFilter/fetch.ts), диск — свои POETH-NeverSink-<уровень>.filter
// в папке фильтров игры (lootFilter/install.ts).
// Фоновая проверка новой версии — только с галочкой «Проверять» и не чаще раза в сутки; при открытом экране —
// тоже раз в сутки. Новую версию с галочкой напоминаем один раз уведомлением, ставим — только по кнопке.

const LINKS: readonly LootFilterLink[] = ['repo', 'license', 'release', 'filterblade', 'ladder']
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
  const { state, newTag } = await checkLatest(false, Date.now(), push)
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

const PICK_TITLE = {
  poe1: { ru: 'Папка фильтров Path of Exile', en: 'Path of Exile filter folder' },
  poe2: { ru: 'Папка фильтров Path of Exile 2', en: 'Path of Exile 2 filter folder' }
} as const

function register(): void {
  ipcMain.handle(IPC.lootFilter.state, () => getLootFilterState())
  ipcMain.handle(IPC.lootFilter.screenOpened, async () => push((await checkLatest(true, Date.now(), push)).state))
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
      title: PICK_TITLE[st.game][await uiLang()],
      defaultPath: st.folder.path,
      properties: ['openDirectory', 'dontAddToRecent']
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || r.filePaths.length === 0) return st
    return push(await setLootFilterDir(r.filePaths[0]))
  })
  ipcMain.handle(IPC.lootFilter.resetFolder, async () => push(await setLootFilterDir(null)))
  ipcMain.handle(IPC.lootFilter.openFolder, async () => {
    const g = lootFilterGame()
    const folder = folderOf(await getLootFilterData(g), g)
    if (folder.found) await shell.openPath(folder.path)
  })
  ipcMain.handle(IPC.lootFilter.openLink, async (_e, link: unknown) => {
    if (!LINKS.includes(link as LootFilterLink)) return
    const g = lootFilterGame()
    const s = await getSettings()
    // ладдер: PoE 1 — по хосту сайта (S53), PoE 2 — по языку клиента игры (не узнали — интерфейса)
    const ladder = { siteHost: s.siteHost, lang: resolveGameLang(s.gameLang, s.uiLang).lang }
    const url = linkUrl(link as LootFilterLink, (await getLootFilterData(g)).latest?.tag, g, ladder)
    if (url) await shell.openExternal(url)
  })
}

function setupForGame(def: GameDef): void {
  // S64: раздел есть у обеих игр; у каждой — свой репозиторий, папка и файл состояния
  setLootFilterGame(def.id)
  startTimers()
  // окно могло спросить состояние раньше, чем домен узнал игру (on: false) — пришлём заново
  void getLootFilterState()
    .then(push)
    .catch(() => undefined)
}

export const lootFilterDomain: IpcDomain = { register, setupForGame }
