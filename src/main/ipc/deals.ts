import { app, dialog, ipcMain, net } from 'electron'
import { existsSync, promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type {
  DealCardAction,
  DealLang,
  DealStatus,
  DealsCalibrateResult,
  DealsConfigPatch,
  DealsExportResult,
  DealsLogStatus,
  HotkeyAction,
  TailerStatus
} from '@shared/types'
import { DEAL_ACTIONS } from '@shared/deals/commands'
import { activeCards, topCard } from '@shared/deals/cards'
import { DealsStore, attachLogSource, type RawLineSource } from '../services/dealsStore'
import { BlacklistService, type TextFetcher } from '../services/dealsBlacklist'
import * as tailerModule from '../services/logTailer'
import { typeInChat } from '../input/gameInput'
import { onHotkeyAction } from '../hotkeys'
import {
  activateOverlay,
  ensureGameForeground,
  getOverlayStatus,
  sendToOverlay
} from '../windows/gameOverlay'
import { getCompanionWindow, sendToCompanion } from '../windows/companionWindow'
import type { IpcDomain } from './types'

// Домен «менеджер сделок» (main, этап S8).
// Фаза 1: история (userData/deals.json), настройки менеджера, экспорт, чёрный список PoE Hub
// (кэш userData/cache/poehub-blacklist.json), примеры.
// Фаза 2: строки Client.txt PoE1 (LogTailer с GameDef.logSubdirs, событие 'lines') → история;
// карточки поверх игры (оверлей S1, overlay/deals/) — кнопки и хоткеи верхней карточки дают
// РОВНО ОДНУ команду в чат через typeInChat; калибровка стэша кликами поверх игры.
// Никаких автоответов и таймеров: каждая команда — по нажатию игрока.

let store: DealsStore | null = null
let blacklist: BlacklistService | null = null
let started: Promise<void> | null = null

/** Сеть списка: net.fetch сессии окон (без cookies аккаунта). После S3-рефакторинга — net/http.ts. */
const fetchText: TextFetcher = async (url, { etag, timeoutMs }) => {
  const res = await net.fetch(url, {
    headers: etag ? { 'If-None-Match': etag } : {},
    signal: AbortSignal.timeout(timeoutMs)
  })
  return { status: res.status, body: res.status === 200 ? await res.text() : '', etag: res.headers.get('etag') ?? undefined }
}

/** Событие во все окна, которым оно нужно: компаньон (вкладка «Сделки») и оверлей (карточки). */
function broadcast(channel: string, payload?: unknown): void {
  sendToCompanion(channel, payload)
  sendToOverlay(channel, payload)
}

function getStore(): DealsStore {
  if (!store) {
    const s = new DealsStore(path.join(app.getPath('userData'), 'deals.json'))
    const bl = new BlacklistService({
      cacheFile: path.join(app.getPath('userData'), 'cache', 'poehub-blacklist.json'),
      fetcher: fetchText
    })
    s.setBlacklistChecker((who) => bl.check(who))
    s.on('changed', (state) => broadcast(IPC.events.dealsChanged, state))
    s.on('deal', (deal) => broadcast(IPC.events.dealsNew, deal))
    bl.on('status', (st) => broadcast(IPC.events.dealsBlacklist, st))
    store = s
    blacklist = bl
  }
  return store
}

function getBlacklist(): BlacklistService {
  getStore()
  return blacklist as BlacklistService
}

/** Включить/выключить фоновое обновление списка по настройке «проверять по чёрному списку». */
function syncBlacklist(enabled: boolean): void {
  const bl = getBlacklist()
  if (enabled) {
    void bl.refreshIfStale() // в фоне: запуск не ждёт сеть
    bl.startAutoRefresh()
  } else bl.stop()
}

/** Загрузить историю и кэш чёрного списка (с диска); сеть — в фоне и только если проверка включена. */
function start(): Promise<void> {
  if (!started) {
    started = (async () => {
      const s = getStore()
      await s.load()
      await getBlacklist().loadCache()
      syncBlacklist(s.getState().config.checkBlacklist)
    })().catch((e) => console.error('[deals] запуск:', e))
  }
  return started
}

// ---------------------------------------------------------------------------
// Client.txt PoE1: LogTailer({ logSubdirs }) + событие 'lines' (патч logTailer, через лида)
// ---------------------------------------------------------------------------

interface LinesTailer extends RawLineSource {
  start(customPath?: string | null): Promise<TailerStatus>
  stop(): void
  getStatus(): TailerStatus
}

/**
 * Патч logTailer (S8-logTailer.patch: опции конструктора + 'lines') распознаётся по экспорту
 * candidateLogPaths. Без него тейлер искал бы лог PoE2 и не отдавал строки — не запускаем.
 */
const TAILER_SUPPORTED = 'candidateLogPaths' in tailerModule
type TailerCtor = new (opts: { logSubdirs: string[] }) => LinesTailer

let tailer: LinesTailer | null = null
let tailerDef: GameDef | null = null

function logStatus(): DealsLogStatus {
  const st = tailer?.getStatus()
  return {
    supported: TAILER_SUPPORTED,
    connected: !!st?.running && !!st.found,
    logPath: st?.logPath ?? null,
    custom: !!store?.getState().config.logPath
  }
}

/** Запустить/перезапустить чтение Client.txt PoE1 (менеджер включён и игра — с deals). */
async function reconcileLog(): Promise<void> {
  const def = tailerDef
  const s = getStore()
  await s.load()
  if (!TAILER_SUPPORTED || !def?.features.deals) {
    stopLog()
    return
  }
  if (!tailer) {
    const Ctor = tailerModule.LogTailer as unknown as TailerCtor
    tailer = new Ctor({ logSubdirs: def.logSubdirs })
    attachLogSource(tailer, s) // тейлер живёт до выхода — отписка не нужна
  }
  const custom = s.getState().config.logPath
  await tailer.start(custom && existsSync(custom) ? custom : null)
  broadcast(IPC.events.dealsLog, logStatus())
}

function stopLog(): void {
  tailer?.stop()
  broadcast(IPC.events.dealsLog, logStatus())
}

async function pickLog(reset: boolean): Promise<DealsLogStatus> {
  const s = getStore()
  if (reset) {
    await s.setConfig({ logPath: null })
  } else {
    const win = getCompanionWindow()
    const ru = app.getLocale().startsWith('ru')
    const opts = {
      title: ru ? 'Выберите Client.txt Path of Exile' : 'Choose the Path of Exile Client.txt',
      properties: ['openFile' as const],
      filters: [{ name: 'Client log', extensions: ['txt'] }]
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled || r.filePaths.length === 0) return logStatus()
    await s.setConfig({ logPath: r.filePaths[0] })
  }
  await reconcileLog()
  return logStatus()
}

// ---------------------------------------------------------------------------
// Кнопки и хоткеи карточек: одна команда в чат на нажатие
// ---------------------------------------------------------------------------

/** Команда в чат игры и сразу Enter (S1 typeInChat: буфер вернётся, канал чата — тоже). */
const sendToChat = (command: string) => typeInChat(command, { send: true })

function cardAction(id: string, action: DealCardAction) {
  return getStore().cardAction(id, action, sendToChat)
}

/**
 * Хоткеи верхней карточки (область 'game', одно действие на нажатие). Действия добавляет лид
 * в Settings v2 (HotkeyAction/HOTKEY_DEFAULTS); пока их нет в настройках, обработчики не
 * регистрируются (hotkeyPlan берёт только назначенные сочетания).
 */
export const DEAL_HOTKEYS = {
  dealInvite: 'invite',
  dealTrade: 'trade',
  dealDismiss: 'dismiss'
} as const

async function onDealHotkey(what: (typeof DEAL_HOTKEYS)[keyof typeof DEAL_HOTKEYS]): Promise<void> {
  const s = getStore()
  await s.load()
  const st = s.getState()
  const cards = activeCards(st.deals, st.config, Date.now())
  if (what === 'dismiss') {
    const top = cards[0]
    if (top) await s.hideCard(top.id)
    return
  }
  const top = topCard(cards, 'in')
  if (top && !top.blacklist) await cardAction(top.id, what)
}

/** Калибровка стэша: игра на передний план, оверлей активен, оверлей ждёт два клика. */
async function startCalibration(): Promise<DealsCalibrateResult> {
  const st = getOverlayStatus()
  if (st.tracking && !st.attached) return 'no-game'
  ensureGameForeground()
  // focusTarget асинхронен: даём игре стать активной, иначе оверлей скрыт и не активируется
  await new Promise((r) => setTimeout(r, 150))
  activateOverlay()
  sendToOverlay(IPC.events.dealsCalibrate)
  return 'ok'
}

// ---------------------------------------------------------------------------

const STATUSES: DealStatus[] = ['new', 'invited', 'traded', 'sold', 'ignored']
const MAX_SIM_LINES = 500
const MAX_LINE_LEN = 4000

function isoDate(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function exportHistory(): Promise<DealsExportResult> {
  const s = getStore()
  await s.load()
  const win = getCompanionWindow()
  const ru = app.getLocale().startsWith('ru')
  const opts = {
    title: ru ? 'Экспорт истории сделок' : 'Export trade history',
    defaultPath: `poeth-deals-${isoDate()}.csv`,
    filters: [
      { name: 'CSV (Excel)', extensions: ['csv'] },
      { name: 'JSON', extensions: ['json'] }
    ]
  }
  const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (result.canceled || !result.filePath) return { status: 'canceled' }
  try {
    const json = result.filePath.toLowerCase().endsWith('.json')
    await fs.writeFile(result.filePath, json ? s.exportJson() : s.exportCsv(), 'utf8')
    return { status: 'saved', path: result.filePath }
  } catch {
    return { status: 'error' }
  }
}

function register(): void {
  ipcMain.handle(IPC.deals.state, async () => {
    await start()
    return getStore().getState()
  })
  ipcMain.handle(IPC.deals.setStatus, (_e, id: unknown, status: unknown) => {
    if (typeof id !== 'string' || !STATUSES.includes(status as DealStatus)) return getStore().getState()
    return getStore().setStatus(id, status as DealStatus)
  })
  ipcMain.handle(IPC.deals.remove, (_e, id: unknown) =>
    typeof id === 'string' ? getStore().remove(id) : getStore().getState()
  )
  ipcMain.handle(IPC.deals.clear, (_e, demoOnly: unknown) => getStore().clear(demoOnly === true))
  ipcMain.handle(IPC.deals.setConfig, async (_e, patch: unknown) => {
    // путь к логу меняется только через диалог pickLog
    const { logPath: _ignored, ...rest } = (patch ?? {}) as DealsConfigPatch
    const state = await getStore().setConfig(rest)
    syncBlacklist(state.config.checkBlacklist)
    return state
  })
  ipcMain.handle(IPC.deals.export, () => exportHistory())
  ipcMain.handle(IPC.deals.demo, (_e, lang: unknown) => getStore().addDemo((lang === 'ru' ? 'ru' : 'en') as DealLang))
  ipcMain.handle(IPC.deals.simulate, (_e, lines: unknown) => {
    if (!Array.isArray(lines)) return []
    const clean = lines
      .filter((l): l is string => typeof l === 'string')
      .slice(0, MAX_SIM_LINES)
      .map((l) => l.slice(0, MAX_LINE_LEN))
    return getStore().ingestLines(clean)
  })
  ipcMain.handle(IPC.deals.logStatus, () => logStatus())
  ipcMain.handle(IPC.deals.pickLog, (_e, reset: unknown) => pickLog(reset === true))
  // кнопка карточки: id сделки и имя действия — сам текст команды строит main (из истории
  // и шаблонов), renderer не может напечатать в чат произвольное
  ipcMain.handle(IPC.deals.action, async (_e, id: unknown, action: unknown) => {
    if (typeof id !== 'string' || !DEAL_ACTIONS.includes(action as DealCardAction)) {
      return { result: 'no-deal', state: getStore().getState() }
    }
    return cardAction(id, action as DealCardAction)
  })
  ipcMain.handle(IPC.deals.hideCard, (_e, id: unknown, hidden: unknown) =>
    typeof id === 'string' ? getStore().hideCard(id, hidden !== false) : getStore().getState()
  )
  ipcMain.handle(IPC.deals.calibrate, () => startCalibration())
  ipcMain.handle(IPC.deals.blacklist.status, async () => {
    await getBlacklist().loadCache()
    return getBlacklist().status()
  })
  ipcMain.handle(IPC.deals.blacklist.refresh, async () => {
    const bl = getBlacklist()
    await bl.refresh()
    return bl.status()
  })
  ipcMain.handle(IPC.deals.blacklist.check, (_e, name: unknown) => {
    if (typeof name !== 'string' || !name.trim()) return null
    const n = name.trim().slice(0, 64)
    return getBlacklist().check({ account: n, character: n })
  })
}

async function setupForGame(def: GameDef): Promise<void> {
  tailerDef = def
  if (!def.features.deals) {
    stopLog()
    return
  }
  await start()
  for (const [action, what] of Object.entries(DEAL_HOTKEYS)) {
    // действия появятся в HotkeyAction после патча Settings v2 (лид) — до тех пор не назначены
    onHotkeyAction(action as unknown as HotkeyAction, () => onDealHotkey(what))
  }
  await reconcileLog()
}

export const dealsDomain: IpcDomain = { register, setupForGame }
