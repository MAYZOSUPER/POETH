import { app, ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import { isTrustedAppUrl } from '../net/guards'
import { getEffectiveLeague, netLog, onLeaguesChanged } from '../net'
import { onSettingsChange } from '../services/settingsStore'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { resourcesDir } from '../services/questDataset'
import { getFeedStore } from '../games/poe1/exchange/feedService'
import { FEED_WANT_HOURS, FlipManager, type GoldFees } from '../games/poe1/flip/manager'
import { onHotkeyAction } from '../hotkeys'
import { getCursorInOverlay } from '../windows/gameOverlay'
import { bookFromTable } from '@shared/ocr/read'
import type { BookReadResult, FlipBookEvent } from '@shared/types'
import { captureBook, saveFixtureShot } from '../ocr/capture'
import { readBookImage, stopBookReader } from '../ocr/reader'
import { itemFlipLeagueChanged, registerItemFlip, setupItemFlip } from '../games/poe1/flip/items/ipc'
import type { IpcDomain } from './types'

// Домен «помощник по флиппингу» (main, S13): часы фида обмена GGG из общего хранилища (его же берут учёт
// богатства и курс для окна цены), маршруты и курс divine:chaos. Звать каналы могут только наши страницы.
// S28: стакан «Курс / Кол-во» с экрана по хоткею (Alt над «Рыночным курсом» + bookRead) — снимок у курсора,
// распознавание в своём потоке, итог — в карточку «Как сделать» компаньона и тостом у курсора в оверлее.

function devServerUrl(): string | undefined {
  return process.env.ELECTRON_RENDERER_URL
}

function broadcast(channel: string, payload: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || !isTrustedAppUrl(wc.getURL(), devServerUrl())) continue
    wc.send(channel, payload)
  }
}

const log = (msg: string): void => netLog('debug', msg)

/** Файл данных: обновлённый (userData/data) главнее встроенного. */
async function readData<T>(rel: string): Promise<T | null> {
  for (const base of [path.join(app.getPath('userData'), 'data'), path.join(resourcesDir(), 'data')]) {
    try {
      return JSON.parse(await fs.readFile(path.join(base, 'poe1', rel), 'utf8')) as T
    } catch {
      // следующий кандидат
    }
  }
  return null
}

const configFile = (): string => path.join(app.getPath('userData'), 'flip', 'config.json')

let manager: FlipManager | null = null
let unsubs: Array<() => void> = []

function getManager(): FlipManager {
  if (manager) return manager
  manager = new FlipManager({
    feed: getFeedStore(),
    league: () => getEffectiveLeague(),
    loadNames: async () => (await readData<{ names?: Record<string, string> }>('wealth/exchange-ids.json'))?.names ?? {},
    loadFees: async () => {
      const raw = await readData<GoldFees & { version?: number }>('flip/gold-fees.json')
      return raw && raw.fees && typeof raw.fees === 'object' ? raw : null
    },
    loadConfig: () => readJson<unknown>(configFile(), null),
    saveConfig: (cfg) => writeJsonAtomic(configFile(), cfg),
    emit: (s) => broadcast(IPC.events.flipState, s),
    // тост показывает оверлей: src/renderer/src/overlay/flip/widget.tsx
    alert: (a) => broadcast(IPC.events.flipAlert, a),
    log
  })
  return manager
}

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedAppUrl(e.senderFrame?.url, devServerUrl())) throw new Error('flip: untrusted IPC sender')
    return fn(...args)
  })
}

/** последние чтения стакана (вкладка «Обмен» могла быть закрыта, пока игрок читал обе ноги) */
const RECENT_BOOKS = 6
let recentBooks: FlipBookEvent[] = []
let bookBusy = false

/**
 * Хоткей bookRead: снимок области у курсора → поток распознавания → стакан. Одно нажатие — одно чтение,
 * в игру ничего не шлём (клавиши игрока не отпускаем — hotkeys.ts keepKeys, иначе Alt «отпустится» и
 * таблица исчезнет до снимка).
 */
async function readBookNow(): Promise<void> {
  const at = Date.now()
  const send = (result: BookReadResult, cursor: FlipBookEvent['cursor']): void => {
    const e: FlipBookEvent = { result, cursor }
    // «уже читаем» не запоминаем
    if (result.ok || result.reason !== 'busy') recentBooks = [...recentBooks, e].slice(-RECENT_BOOKS)
    broadcast(IPC.events.flipBook, e)
  }
  if (bookBusy) return send({ ok: false, reason: 'busy', at }, null)
  bookBusy = true
  try {
    const shot = captureBook()
    if (shot === 'no-game' || shot === 'error') return send({ ok: false, reason: shot, at }, null)
    const pos = getCursorInOverlay()
    void saveFixtureShot(shot).catch((e) => log(`ocr fixture save failed: ${String(e)}`))
    const { table, ms } = await readBookImage(shot.img, shot.hint)
    if (!table) return send({ ok: false, reason: 'no-table', at }, pos)
    const reading = bookFromTable(table, at)
    if (!reading) return send({ ok: false, reason: 'unreadable', at }, pos)
    log(`book read: ${reading.rows.length} rows, ${reading.doubt.length} doubtful cells, ${ms} ms`)
    send({ ok: true, reading, ms }, pos)
  } catch (e) {
    log(`book read failed: ${e instanceof Error ? e.message : String(e)}`)
    send({ ok: false, reason: 'error', at }, null)
  } finally {
    bookBusy = false
  }
}

function register(): void {
  const m = (): FlipManager => getManager()
  handle(IPC.flip.bookRecent, () => recentBooks)
  handle(IPC.flip.state, () => m().state())
  handle(IPC.flip.refresh, async () => {
    await m().refresh()
    return m().state()
  })
  handle(IPC.flip.setFilters, (patch) => m().setFilters(patch))
  handle(IPC.flip.setOptions, (patch) => m().setOptions(patch))
  registerItemFlip(handle, broadcast)
}

async function setupForGame(def: GameDef): Promise<void> {
  for (const u of unsubs) u()
  unsubs = []
  const m = getManager()
  const feed = getFeedStore()
  if (def.id !== 'poe1') {
    feed.stop()
    m.stop()
    stopBookReader()
    await setupItemFlip(def)
    return
  }
  onHotkeyAction('bookRead', () => readBookNow(), { keepKeys: true })
  const leagueChanged = (): void => {
    void m.onLeagueChanged()
    itemFlipLeagueChanged()
  }
  unsubs.push(onLeaguesChanged(leagueChanged))
  unsubs.push(onSettingsChange(leagueChanged))
  // часы фида — раз в час для всех (учёт богатства, курс окна цены, флиппинг)
  feed.start(() => getEffectiveLeague().catch(() => null), FEED_WANT_HOURS)
  await m.start()
  await setupItemFlip(def)
}

export const flipDomain: IpcDomain = { register, setupForGame }
