import { app, ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { ExchangeIdNames } from '@shared/wealth/sources'
import type { PriceIndex } from '@shared/wealth/prices'
import type { WealthPriceInfo } from '@shared/types/wealth'
import { isTrustedAppUrl } from '../net/guards'
import { getAuthStatus, getEffectiveLeague, httpRequest, netLog, onAuthStatus, onLeaguesChanged } from '../net'
import { onSettingsChange } from '../services/settingsStore'
import { resourcesDir } from '../services/questDataset'
import { LegacyStashProvider } from '../games/poe1/wealth/stashProvider'
import { PriceService } from '../games/poe1/wealth/priceService'
import { WealthManager } from '../games/poe1/wealth/manager'
import { WealthStore } from '../games/poe1/wealth/store'
import { getDivineTrack, getFeedStore } from '../games/poe1/exchange/feedService'
import { getFarmState, onFarmEvent, setRunProfit } from '../services/farmSession'
import type { IpcDomain } from './types'
import { devEnv } from '../devEnv'
import { isAppPageUrl } from '../security'
import { parsePoe2CurrencyList } from '@shared/wealth/poe2'
import { getLastScreenRead } from '../screen/service'
import { getCompanionWindow, sendToCompanion } from '../windows/companionWindow'
import { Poe2PriceService } from '../games/poe2/wealth/prices'
import { Poe2WealthManager } from '../games/poe2/wealth/manager'
import { Poe2WealthStore } from '../games/poe2/wealth/store'

// Домен «учёт богатства» (main, S11a): стэш через legacy-эндпоинты на сессии аккаунта
// (только main, cookies в renderer не уходят), цены — фид обмена GGG и poe.watch, снимки —
// userData/wealth. Звать каналы могут только наши страницы; события — только им.
// S70 — «Богатство PoE 2» (src/main/games/poe2/wealth): API тайника у PoE 2 нет; ручной ввод, ценные предметы из
// окна цены и снимок особой вкладки с экрана по клавише игрока (модуль S68, только вызов) → userData/wealth-poe2.

function devServerUrl(): string | undefined {
  return devEnv('ELECTRON_RENDERER_URL')
}

function broadcast(channel: string, payload: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || !isAppPageUrl(wc.getURL())) continue
    wc.send(channel, payload)
  }
}

const log = (msg: string): void => netLog('debug', msg)

let manager: WealthManager | null = null
let priceService: PriceService | null = null
let unsubs: Array<() => void> = []

async function loadNames(): Promise<ExchangeIdNames | null> {
  // обновлённые данные (userData/data) главнее встроенных
  for (const base of [path.join(app.getPath('userData'), 'data'), path.join(resourcesDir(), 'data')]) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(base, 'poe1', 'wealth', 'exchange-ids.json'), 'utf8')) as ExchangeIdNames
      if (raw && raw.version === 1 && raw.names && typeof raw.names === 'object') return raw
    } catch {
      // следующий кандидат
    }
  }
  return null
}

function getManager(): WealthManager {
  if (manager) return manager
  const store = new WealthStore(path.join(app.getPath('userData'), 'wealth'))
  const provider = new LegacyStashProvider({
    transport: async (r) => {
      const res = await httpRequest({ url: r.url, method: r.method, body: r.body })
      return { status: res.status, headers: res.headers, body: res.body }
    },
    loggedIn: () => getAuthStatus().loggedIn,
    statusAccountName: () => getAuthStatus().accountName,
    log
  })
  const prices = (priceService = new PriceService({
    // часы фида обмена — общее хранилище (флиппинг S13, курс divine для окна цены S4)
    feed: getFeedStore(),
    // api.poe.watch — без cookie сессии pathofexile.com (http.ts)
    getJson: async (url) => {
      const res = await httpRequest({ url, timeoutMs: 45_000 })
      let json: unknown = null
      try {
        json = JSON.parse(res.body)
      } catch {
        json = null
      }
      return { status: res.status, json }
    },
    readCache: (rel) => store.readCache(rel),
    writeCache: (rel, data) => store.writeCache(rel, data),
    listCache: (dir) => store.listCache(dir),
    removeCache: (rel) => store.removeCache(rel),
    loadNames,
    log
  }))
  manager = new WealthManager({
    provider,
    prices,
    store,
    league: () => getEffectiveLeague(),
    loggedIn: () => getAuthStatus().loggedIn,
    emit: (s) => broadcast(IPC.events.wealthState, s),
    log
  })
  return manager
}

/**
 * API для трекера карт S11b (main): подписка на снимки, стоимость на момент времени, снимок.
 * В PoE2 учёта богатства нет — null.
 */
export function getWealthApi(): Pick<WealthManager, 'onSnapshot' | 'getNetWorthAt' | 'takeSnapshot'> | null {
  if (!manager || !manager.state().supported) return null
  const m = manager
  return {
    onSnapshot: (cb) => m.onSnapshot(cb),
    getNetWorthAt: (at, league) => m.getNetWorthAt(at, league),
    takeSnapshot: () => m.takeSnapshot()
  }
}

/**
 * Курс chaos за divine для других доменов (S4: окно цены) — трекер курса по общему хранилищу фида обмена GGG
 * (тот же курс у учёта богатства и флиппинга); фида нет — poe.watch, если он включён в учёте богатства.
 * null — данных нет (сеть недоступна и кэша нет).
 */
export async function getDivineRate(league: string): Promise<{ chaosPerDivine: number; hour?: number } | null> {
  const track = await getDivineTrack(league).catch(() => null)
  if (track && track.current > 0) return { chaosPerDivine: track.current, hour: track.hour }
  const m = getManager()
  const prices = priceService!
  let poeWatch = false
  try {
    poeWatch = m.state().options.poeWatch
  } catch {
    // менеджер ещё не загрузил настройки — только фид обмена
  }
  await prices.refresh(league, { poeWatch })
  const rate = prices.divineRate(league, { poeWatch })
  if (!(rate > 0)) return null
  const hour = prices.exchange.prices(league).lastHour
  return hour !== undefined ? { chaosPerDivine: rate, hour: hour * 1000 } : { chaosPerDivine: rate }
}

/**
 * Индекс цен лиги для других доменов (S16: советник «что фармить») — тот же, что у снимков тайника:
 * фид обмена GGG, poe.watch — если он включён в учёте богатства. Устаревшие источники обновляются (не бросает).
 */
export async function getPriceIndex(league: string): Promise<{ index: PriceIndex; info: WealthPriceInfo }> {
  const m = getManager()
  const prices = priceService!
  let poeWatch = false
  try {
    poeWatch = m.state().options.poeWatch
  } catch {
    // менеджер ещё не загрузил настройки — только фид обмена
  }
  await prices.refresh(league, { poeWatch })
  return { index: prices.index(league, { poeWatch }), info: prices.info(league, { poeWatch }) }
}

// ------------------------------------------------------------------ «Богатство PoE 2» (S70)

let poe2: Poe2WealthManager | null = null

/** Файл данных PoE 2: надстройка обновлений (userData/data/poe2) главнее встроенного. */
async function readPoe2Data(rel: string): Promise<string | null> {
  for (const base of [path.join(app.getPath('userData'), 'data', 'poe2'), path.join(resourcesDir(), 'data', 'poe2')]) {
    try {
      return await fs.readFile(path.join(base, rel), 'utf8')
    } catch {
      // следующий кандидат
    }
  }
  return null
}

/** Результат распознавания (S68) старше этого «Записать в богатство» не берёт: подписи держатся 45 с. */
const SCREEN_RECORD_MAX_AGE_MS = 2 * 60_000

/**
 * «Записать в богатство» в панели Alt+F (оверлей): последний результат распознавания S68 → карточка в компаньоне,
 * окно компаньона показывается. Снимок экрана не нужен — S68 отдаёт имена, числа и ячейки.
 */
function poe2ScreenRecord(): { ok: boolean } {
  const read = getLastScreenRead()
  if (!read || Date.now() - read.at > SCREEN_RECORD_MAX_AGE_MS) return { ok: false }
  if (!getPoe2().screenRecord(read)) return { ok: false }
  const win = getCompanionWindow()
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show()
    win.focus()
  }
  return { ok: true }
}

function getPoe2(): Poe2WealthManager {
  if (poe2) return poe2
  poe2 = new Poe2WealthManager({
    store: new Poe2WealthStore(path.join(app.getPath('userData'), 'wealth-poe2')),
    prices: new Poe2PriceService({ feed: getFeedStore('poe2'), read: readPoe2Data, log }),
    currency: async () => {
      const s = await readPoe2Data('wealth/currency.json')
      try {
        return s ? parsePoe2CurrencyList(JSON.parse(s)) : null
      } catch {
        return null
      }
    },
    league: () => getEffectiveLeague().catch(() => null),
    currentRunId: () => {
      const st = getFarmState(0)
      return st.session && st.current?.sessionId === st.session.id ? st.current.id : null
    },
    // карточка снимка вкладки и итог — только окну компаньона
    emit: (s) => sendToCompanion(IPC.events.wealthPoe2, s),
    log
  })
  return poe2
}

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedAppUrl(e.senderFrame?.url, devServerUrl())) throw new Error('wealth: untrusted IPC sender')
    return fn(...args)
  })
}

function register(): void {
  const m = (): WealthManager => getManager()
  handle(IPC.wealth.state, () => m().state())
  handle(IPC.wealth.refreshTabs, () => m().refreshTabs())
  handle(IPC.wealth.setTabs, (ids) => m().setTabs(ids))
  handle(IPC.wealth.setAccount, (name) => m().setAccount(name))
  handle(IPC.wealth.setOptions, (patch) => m().setOptions(patch))
  handle(IPC.wealth.snapshot, () => m().refresh())
  handle(IPC.wealth.startFarm, () => m().startFarm())
  handle(IPC.wealth.stopFarm, () => m().stopFarm())
  handle(IPC.wealth.detail, (id) => m().detail(id))
  handle(IPC.wealth.diff, (from, to) => m().diff(from, to))
  // S70: «Богатство PoE 2»
  handle(IPC.wealth.poe2State, () => getPoe2().stateFresh())
  handle(IPC.wealth.poe2SetManual, (name, qty) => getPoe2().setManual(name, qty))
  handle(IPC.wealth.poe2SetGold, (qty) => getPoe2().setGold(qty))
  handle(IPC.wealth.poe2AddItem, (item) => getPoe2().addValuable(item))
  handle(IPC.wealth.poe2RemoveItem, (id) => getPoe2().removeValuable(id))
  handle(IPC.wealth.poe2RemoveTab, (id) => getPoe2().removeScreenTab(id))
  handle(IPC.wealth.poe2ScreenEdit, (tabId, key, edit) => getPoe2().screenEdit(tabId, key, edit))
  handle(IPC.wealth.poe2ScreenDrop, (tabId) => getPoe2().screenDrop(tabId))
  handle(IPC.wealth.poe2ScreenAccept, (tabId) => getPoe2().screenAccept(tabId))
  // оверлей: кнопка «Записать в богатство» в панели Alt+F (S68)
  handle(IPC.wealth.poe2ScreenRecord, () => poe2ScreenRecord())
  handle(IPC.wealth.poe2Diff, (from, to) => getPoe2().diff(from, to))
}

async function setupPoe2(): Promise<void> {
  const p = getPoe2()
  unsubs.push(onLeaguesChanged(() => void p.onLeagueChanged()))
  unsubs.push(onSettingsChange(() => void p.onLeagueChanged()))
  await p.start()
  // прибыль сессии фарма: трекер карт PoE 2 (S69) — те же onFarmEvent / setRunProfit, что у PoE 1
  p.attachFarm({ onFarmEvent, setRunProfit })
}

async function setupForGame(def: GameDef): Promise<void> {
  for (const u of unsubs) u()
  unsubs = []
  const m = getManager()
  if (def.id !== 'poe1') {
    m.attachFarm(null)
    m.stop()
    if (def.id === 'poe2') await setupPoe2()
    return
  }
  poe2?.stop()
  unsubs.push(onAuthStatus(() => m.onAuthChanged()))
  unsubs.push(onLeaguesChanged(() => void m.onLeagueChanged()))
  unsubs.push(onSettingsChange(() => void m.onLeagueChanged()))
  await m.start()
  // трекер карт S11b: снимки на границах забегов и прибыль за карту (S11a сливался вторым)
  m.attachFarm({ onFarmEvent, setRunProfit })
}

export const wealthDomain: IpcDomain = { register, setupForGame }
