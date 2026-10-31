// Цены «Богатства PoE 2» (S70). Ядро без electron: фид и чтение данных передаются снаружи (боевой экземпляр —
// src/main/ipc/wealth.ts, тесты — tests/wealth/poe2Manager.test.ts).
//
// Цена штуки — в exalted (база PoE 2):
//  - «у Ange» по почасовому фиду обмена GGG poe2 (S61: тот же FeedStore и кэш часов, что у окна цены; курс ex ↔ div);
//  - чего в фиде нет — снимок poe.ninja PoE 2 (S67, файл пакета данных; снимок чужой лиги или «мало данных» — low).
// Сеть — только фид GGG (web.poecdn.com, без cookies) и только когда игрок открыл вкладку или поменял богатство:
// FeedStore сам не ходит чаще раза в 10 минут, своих таймеров здесь нет. Сайт трейда не трогаем.

import type { FullHour } from '@shared/flip/feed'
import { angePriceByName, feedIdsByName, poe2Rate, type Poe2Rate } from '@shared/poe2/pricecheck/ange'
import { loadPoe2Prices, type LoadedPoe2Prices, type Poe2DataReader } from '@shared/poe2/prices/load'
import type { ExchangeIdNames } from '@shared/wealth/sources'
import type { Poe2Price, Poe2PriceOf } from '@shared/wealth/poe2'
import type { Poe2WealthPrices } from '@shared/types/wealth'

/** Часов фида для цены — как у окна цены PoE 2 (S61). */
export const POE2_FEED_HOURS = 12

export interface Poe2FeedLike {
  refresh(league: string, want?: number): Promise<boolean>
  hours(league: string, limit?: number): FullHour[]
  hasProblem(): boolean
}

export interface Poe2PriceDeps {
  /** фид обмена GGG poe2 (getFeedStore('poe2')) */
  feed: Poe2FeedLike
  /** файл данных PoE 2: надстройка обновлений, потом встроенные ('exchange/exchange-ids.json', 'prices/…') */
  read: Poe2DataReader
  log?: (msg: string) => void
}

/** Цены лиги на сейчас. */
export interface Poe2PriceView {
  priceOf: Poe2PriceOf
  /** 0 — цен нет вовсе (ни фида, ни снимка) */
  size: number
  exPerDivine: number | null
  info: Poe2WealthPrices
}

const EMPTY: Poe2PriceView = { priceOf: () => null, size: 0, exPerDivine: null, info: {} }

export class Poe2PriceService {
  private names: Promise<Map<string, string[]> | null> | null = null
  private snaps = new Map<string, Promise<LoadedPoe2Prices | null>>()
  private views = new Map<string, Poe2PriceView>()
  private inflight = new Map<string, Promise<Poe2PriceView>>()

  constructor(private readonly deps: Poe2PriceDeps) {}

  /** id фида ↔ английское имя (данные S61) — один раз за запуск. */
  private feedNames(): Promise<Map<string, string[]> | null> {
    this.names ??= this.deps
      .read('exchange/exchange-ids.json')
      .then((s) => {
        const raw = s ? (JSON.parse(s) as ExchangeIdNames) : null
        return raw && raw.version === 1 && raw.names && typeof raw.names === 'object' ? feedIdsByName(raw.names) : null
      })
      .catch(() => null)
    return this.names
  }

  /** Снимок poe.ninja лиги: меняется только с пакетом данных — держим до перезапуска. */
  private snapshot(league: string): Promise<LoadedPoe2Prices | null> {
    let p = this.snaps.get(league)
    if (!p) {
      p = loadPoe2Prices(this.deps.read, league).catch(() => null)
      this.snaps.set(league, p)
    }
    return p
  }

  /** Цены лиги, что уже есть (до первого refresh — пусто, loading). */
  view(league: string): Poe2PriceView {
    const v = this.views.get(league)
    if (v) return this.inflight.has(league) ? { ...v, info: { ...v.info, loading: true } } : v
    return this.inflight.has(league) ? { ...EMPTY, info: { loading: true } } : EMPTY
  }

  /** Обновить фид (если пора) и пересобрать цены лиги; ошибки сети — цены из кэша и снимка, флаг problem. */
  refresh(league: string): Promise<Poe2PriceView> {
    const hit = this.inflight.get(league)
    if (hit) return hit
    const p = this.build(league)
      .catch((e: unknown) => {
        this.deps.log?.(`[wealth2] цены: ${e instanceof Error ? e.message : 'ошибка'}`)
        return this.views.get(league) ?? EMPTY
      })
      .then((v) => {
        this.views.set(league, v)
        return v
      })
      .finally(() => this.inflight.delete(league))
    this.inflight.set(league, p)
    return p
  }

  private async build(league: string): Promise<Poe2PriceView> {
    const [names, snap, hours] = await Promise.all([
      this.feedNames(),
      this.snapshot(league),
      this.deps.feed
        .refresh(league, POE2_FEED_HOURS)
        .catch(() => false)
        .then(() => this.deps.feed.hours(league, POE2_FEED_HOURS))
        .catch(() => [] as FullHour[])
    ])
    const rate: Poe2Rate | null = hours.length ? poe2Rate(hours, league) : null
    const table = snap?.table ?? null
    const info: Poe2WealthPrices = {}
    if (rate) info.feedHour = rate.hour
    if (snap) {
      info.ninjaAt = snap.at
      if (snap.match !== 'exact') info.ninjaLeague = snap.league
    }
    if (this.deps.feed.hasProblem()) info.problem = true
    if (!rate && !table) return { ...EMPTY, info }
    const cache = new Map<string, Poe2Price | null>()
    const priceOf: Poe2PriceOf = (item) => {
      if (cache.has(item)) return cache.get(item) ?? null
      let out: Poe2Price | null = null
      const a = rate && names ? angePriceByName(hours, league, names, item, rate) : undefined
      if (a && a.exalted > 0) out = a.low ? { unit: a.exalted, source: 'ange', low: true } : { unit: a.exalted, source: 'ange' }
      else {
        const n = table?.byName(item)
        // снимок другой лиги (нет снимка лиги игрока) — цена примерная
        if (n?.exalted)
          out = n.low || snap?.match !== 'exact' ? { unit: n.exalted, source: 'ninja', low: true } : { unit: n.exalted, source: 'ninja' }
      }
      cache.set(item, out)
      return out
    }
    return {
      priceOf,
      size: (names?.size ?? 0) + (table?.size ?? 0),
      exPerDivine: rate?.exaltedPerDivine ?? table?.exaltedPerDivine ?? null,
      info
    }
  }
}
