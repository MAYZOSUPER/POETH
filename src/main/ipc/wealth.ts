import { app, ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { ExchangeIdNames } from '@shared/wealth/sources'
import { isTrustedAppUrl } from '../net/guards'
import { getAuthStatus, getEffectiveLeague, httpRequest, netLog, onAuthStatus, onLeaguesChanged } from '../net'
import { onSettingsChange } from '../services/settingsStore'
import { resourcesDir } from '../services/questDataset'
import { LegacyStashProvider } from '../games/poe1/wealth/stashProvider'
import { PriceService } from '../games/poe1/wealth/priceService'
import { WealthManager } from '../games/poe1/wealth/manager'
import { WealthStore } from '../games/poe1/wealth/store'
import { onFarmEvent, setRunProfit } from '../services/farmSession'
import type { IpcDomain } from './types'

// Домен «учёт богатства» (main, S11a): стэш через legacy-эндпоинты на сессии аккаунта
// (только main, cookies в renderer не уходят), цены — фид обмена GGG и poe.watch, снимки —
// userData/wealth. Звать каналы могут только наши страницы; события — только им.

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
    // web.poecdn.com и api.poe.watch — без cookie сессии pathofexile.com (http.ts)
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
 * Курс chaos за divine для других доменов (S4: окно цены) — тот же PriceService учёта богатства: почасовой
 * фид обмена GGG (кэш на диске, не чаще раза в 10 мин), иначе poe.watch, если он включён в учёте богатства.
 * null — данных нет (сеть недоступна и кэша нет).
 */
export async function getDivineRate(league: string): Promise<{ chaosPerDivine: number; hour?: number } | null> {
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
}

async function setupForGame(def: GameDef): Promise<void> {
  for (const u of unsubs) u()
  unsubs = []
  const m = getManager()
  if (def.id !== 'poe1') {
    m.attachFarm(null)
    m.stop()
    return
  }
  unsubs.push(onAuthStatus(() => m.onAuthChanged()))
  unsubs.push(onLeaguesChanged(() => void m.onLeagueChanged()))
  unsubs.push(onSettingsChange(() => void m.onLeagueChanged()))
  await m.start()
  // трекер карт S11b: снимки на границах забегов и прибыль за карту (S11a сливался вторым)
  m.attachFarm({ onFarmEvent, setRunProfit })
}

export const wealthDomain: IpcDomain = { register, setupForGame }
