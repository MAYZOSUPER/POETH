// Цены для учёта богатства (S11a) за интерфейсом PriceSource. Ядро без electron: сеть и диск
// передаются снаружи (боевой экземпляр — src/main/ipc/wealth.ts, тесты — tests/wealth/prices.test.ts).
//
//  - exchange — публичный почасовой фид обмена GGG из общего хранилища часов (exchange/feedStore.ts —
//    его же берут флиппинг S13 и трекер курса divine): VWAP за последние 6/24/48 ч;
//  - poewatch — https://api.poe.watch/compact?league= (уники, камни, карты; запасной для
//    стакающихся): не чаще раза в час, кэш на диске; выключается настройкой;
//  - proxy — заготовка под будущий прокси poe.ninja (poe.ninja просит десктоп-приложения ходить
//    через свой бэкенд; прямые массовые запросы к нему не делаем).
// Ошибка источника не мешает снимку: цены берутся из кэша, строки без цены — «без оценки».

import type { WealthPriceInfo } from '@shared/types/wealth'
import { computeExchangePrices, type ExchangePrices } from '@shared/wealth/exchange'
import { toCompactHour, type FullHour } from '@shared/flip/feed'
import { buildPriceIndex, type PriceEntry, type PriceIndex } from '@shared/wealth/prices'
import { compactPoeWatch, exchangeEntries, poeWatchEntries, type ExchangeIdNames } from '@shared/wealth/sources'

export const POEWATCH_URL = 'https://api.poe.watch/compact'
/** часов фида для VWAP (окна 6/24/48 ч) */
export const FEED_HOURS = 48
export const POEWATCH_TTL_MS = 60 * 60_000
const POEWATCH_RETRY_MS = 10 * 60_000

export interface JsonResponse {
  status: number
  json: unknown
}

/** Часы фида обмена (общее хранилище exchange/feedStore.ts). */
export interface FeedHours {
  /** свежие часы лиги; false — сеть недоступна (данные из кэша) */
  refresh(league: string, want?: number): Promise<boolean>
  /** часы лиги в памяти, от старых к новым */
  hours(league: string, limit?: number): FullHour[]
}

export interface PriceDeps {
  /** часы фида обмена GGG */
  feed: FeedHours
  /** GET без cookies аккаунта; бросает при сетевой ошибке */
  getJson: (url: string) => Promise<JsonResponse>
  /** чтение/запись кэша (относительные пути внутри папки кэша цен) */
  readCache: (rel: string) => Promise<unknown | null>
  writeCache: (rel: string, data: unknown) => Promise<void>
  listCache: (relDir: string) => Promise<string[]>
  removeCache: (rel: string) => Promise<void>
  /** сопоставление id фида с именами (resources/data/poe1/wealth/exchange-ids.json) */
  loadNames: () => Promise<ExchangeIdNames | null>
  now?: () => number
  log?: (msg: string) => void
}

export interface PriceSource {
  readonly id: 'exchange' | 'poewatch' | 'proxy'
  /** обновить, если устарело; не бросает. false — ошибка сети (данные — из кэша) */
  refresh(league: string): Promise<boolean>
  entries(league: string): readonly PriceEntry[]
}

/** Фид обмена GGG. */
export class ExchangeFeedSource implements PriceSource {
  readonly id = 'exchange' as const
  private names: Record<string, string> | null = null
  private cache = new Map<string, { key: string; prices: ExchangePrices; entries: PriceEntry[] }>()

  constructor(private readonly deps: PriceDeps) {}

  private async ensureNames(): Promise<Record<string, string>> {
    if (!this.names) this.names = (await this.deps.loadNames())?.names ?? {}
    return this.names
  }

  async refresh(league: string): Promise<boolean> {
    await this.ensureNames()
    return this.deps.feed.refresh(league, FEED_HOURS)
  }

  private computed(league: string): { prices: ExchangePrices; entries: PriceEntry[] } {
    const hours = this.deps.feed.hours(league, FEED_HOURS)
    const key = hours.map((h) => `${h.hour}:${h.markets.length}`).join(',')
    const hit = this.cache.get(league)
    if (hit && hit.key === key) return hit
    const prices = computeExchangePrices(hours.map(toCompactHour), league)
    const entries = exchangeEntries(prices, this.names ?? {})
    const v = { key, prices, entries }
    this.cache.set(league, v)
    return v
  }

  entries(league: string): readonly PriceEntry[] {
    return this.computed(league).entries
  }

  prices(league: string): ExchangePrices {
    return this.computed(league).prices
  }
}

function leagueFile(league: string): string {
  // имя лиги → безопасное имя файла (латиница/цифры, остальное — код символа)
  return league.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}`).slice(0, 120)
}

/** poe.watch /compact. */
export class PoeWatchSource implements PriceSource {
  readonly id = 'poewatch' as const
  private data = new Map<string, { at: number; entries: PriceEntry[] }>()
  private lastTry = new Map<string, number>()
  private readonly now: () => number

  constructor(private readonly deps: PriceDeps) {
    this.now = deps.now ?? Date.now
  }

  updatedAt(league: string): number | undefined {
    return this.data.get(league)?.at
  }

  async refresh(league: string): Promise<boolean> {
    const now = this.now()
    let have = this.data.get(league)
    if (!have) {
      const disk = (await this.deps.readCache(`poewatch/${leagueFile(league)}.json`)) as {
        at?: number
        league?: string
        items?: unknown
      } | null
      if (disk && disk.league === league && typeof disk.at === 'number') {
        have = { at: disk.at, entries: poeWatchEntries(disk) }
        this.data.set(league, have)
      }
    }
    if (have && now - have.at < POEWATCH_TTL_MS) return true
    if (now - (this.lastTry.get(league) ?? 0) < POEWATCH_RETRY_MS) return !!have
    this.lastTry.set(league, now)
    try {
      const res = await this.deps.getJson(`${POEWATCH_URL}?league=${encodeURIComponent(league)}`)
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
      const compact = compactPoeWatch(res.json)
      if (!compact.items.length) throw new Error('empty')
      const fresh = { at: now, entries: poeWatchEntries(compact) }
      this.data.set(league, fresh)
      await this.deps.writeCache(`poewatch/${leagueFile(league)}.json`, { at: now, league, items: compact.items })
      return true
    } catch (e) {
      this.deps.log?.(`[wealth] poe.watch: ${e instanceof Error ? e.message : 'ошибка'}, цены из кэша`)
      return false
    }
  }

  entries(league: string): readonly PriceEntry[] {
    return this.data.get(league)?.entries ?? []
  }
}

/**
 * Заготовка под будущий прокси цен (poe.ninja через свой бэкенд, план v0.2): пока адреса нет —
 * источник пуст, уники/камни без poe.watch остаются «без оценки».
 */
export class ProxyPriceSource implements PriceSource {
  readonly id = 'proxy' as const
  constructor(readonly baseUrl: string | null = null) {}
  async refresh(): Promise<boolean> {
    return this.baseUrl !== null
  }
  entries(): readonly PriceEntry[] {
    return []
  }
}

export class PriceService {
  readonly exchange: ExchangeFeedSource
  readonly poeWatch: PoeWatchSource
  readonly proxy: ProxyPriceSource
  private problem: WealthPriceInfo['problem'] = null

  constructor(deps: PriceDeps) {
    this.exchange = new ExchangeFeedSource(deps)
    this.poeWatch = new PoeWatchSource(deps)
    this.proxy = new ProxyPriceSource(null)
  }

  /** Обновить источники (не бросает). */
  async refresh(league: string, opts: { poeWatch: boolean }): Promise<void> {
    const [ex, pw] = await Promise.all([
      this.exchange.refresh(league),
      opts.poeWatch ? this.poeWatch.refresh(league) : Promise.resolve(true)
    ])
    this.problem = !ex ? 'exchange' : !pw ? 'poewatch' : null
  }

  /** Индекс цен лиги: фид обмена главнее poe.watch для стакающихся. */
  index(league: string, opts: { poeWatch: boolean }): PriceIndex {
    return buildPriceIndex([this.exchange.entries(league), opts.poeWatch ? this.poeWatch.entries(league) : []])
  }

  /** chaos за divine: фид обмена, иначе poe.watch. */
  divineRate(league: string, opts: { poeWatch: boolean }): number {
    const r = this.exchange.prices(league).divineRate
    if (r > 0) return r
    if (!opts.poeWatch) return 0
    const d = this.poeWatch.entries(league).find((e) => e.kind === 'stackable' && e.name === 'Divine Orb')
    return d?.chaos ?? 0
  }

  info(league: string, opts: { poeWatch: boolean }): WealthPriceInfo {
    const p = this.exchange.prices(league)
    const info: WealthPriceInfo = {
      exchangeItems: this.exchange.entries(league).length,
      poeWatchItems: opts.poeWatch ? this.poeWatch.entries(league).length : 0,
      problem: this.problem
    }
    if (p.lastHour !== undefined) info.exchangeHour = p.lastHour * 1000
    const pwAt = opts.poeWatch ? this.poeWatch.updatedAt(league) : undefined
    if (pwAt !== undefined) info.poeWatchAt = pwAt
    const rate = this.divineRate(league, opts)
    if (rate > 0) info.divineRate = Math.round(rate * 100) / 100
    return info
  }
}
