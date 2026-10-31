import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { mainItem } from '@shared/rumours/schema'
import { EMPTY_PRICE_BOOK, collectPrices, type RumourPriceBook, type RumourPriceRef, type RumourPriceSource } from '@shared/rumours/prices'
import { exchangePriceSource, ninjaPriceSource, type ExchangeFeed } from '@shared/rumours/sources'
import { feedIdsByName } from '@shared/poe2/pricecheck/ange'
import { loadPoe2Prices, type LoadedPoe2Prices } from '@shared/poe2/prices/load'
import type { ExchangeIdNames } from '@shared/wealth/sources'
import { getEffectiveLeague } from '../net/leagues'
import { getFeedStore } from '../games/poe1/exchange/feedService'
import { resourcesDir } from '../services/questDataset'
import { getRumoursLoad } from './data'

// Цены главных наград слухов (S65). Источники по порядку доверия (адаптеры — @shared/rumours/sources):
//  1) обменник GGG — цена у Ange по почасовому фиду `currency-exchange/poe2` (S61: FeedStore PoE 2, кэш
//     userData/exchange/feed-poe2, тот же, что у окна цены); курс ex/div и ex/chaos — тоже отсюда;
//  2) снимок poe.ninja PoE 2 из пакета данных (S67: resources/data/poe2/prices, надстройка — userData/data).
// Запросов при наведении нет: цены спрашиваем, когда открыта вкладка или короткий вид, и держим 15 минут
// (фид качает часы не чаще раза в 10 минут — FeedStore; снимок меняется только с пакетом данных).

const TTL_MS = 15 * 60_000
/** Часов фида для цены у Ange — как у окна цены PoE 2 (S61, ipc/trade.ts POE2_FEED_HOURS). */
const FEED_HOURS = 12

/** Файл данных PoE 2: обновлённый пакетом данных (userData/data/poe2), иначе встроенный. */
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

let feedNames: Promise<Map<string, string[]> | null> | null = null

/** id фида → английское имя (S61: resources/data/poe2/exchange/exchange-ids.json), один раз за запуск. */
function loadFeedNames(): Promise<Map<string, string[]> | null> {
  feedNames ??= readPoe2Data('exchange/exchange-ids.json').then((text) => {
    try {
      const raw = text ? (JSON.parse(text) as ExchangeIdNames) : null
      return raw && raw.version === 1 && raw.names && typeof raw.names === 'object' ? feedIdsByName(raw.names) : null
    } catch {
      return null
    }
  })
  return feedNames
}

async function exchangeFeed(league: string): Promise<ExchangeFeed | null> {
  const byName = await loadFeedNames()
  if (!byName) return null
  const feed = getFeedStore('poe2')
  await feed.refresh(league, FEED_HOURS)
  const hours = feed.hours(league, FEED_HOURS)
  return hours.length ? { hours, byName } : null
}

const ninja = new Map<string, Promise<LoadedPoe2Prices | null>>()

/** Снимок poe.ninja лиги — до перезапуска (меняется только с пакетом данных). */
function ninjaPrices(league: string): Promise<LoadedPoe2Prices | null> {
  let p = ninja.get(league)
  if (!p) {
    p = loadPoe2Prices(readPoe2Data, league).catch(() => null)
    ninja.set(league, p)
  }
  return p
}

const SOURCES: RumourPriceSource[] = [exchangePriceSource(exchangeFeed), ninjaPriceSource(ninjaPrices)]

let book: RumourPriceBook = EMPTY_PRICE_BOOK
let at = 0
let pending: Promise<RumourPriceBook> | null = null

/** Источники цен для тестов. */
export function setRumourPriceSources(sources: RumourPriceSource[]): void {
  SOURCES.length = 0
  SOURCES.push(...sources)
  at = 0
}

export async function getRumourPrices(refresh = false): Promise<RumourPriceBook> {
  if (!refresh && at && Date.now() - at < TTL_MS) return book
  if (pending) return pending
  pending = (async () => {
    try {
      const load = await getRumoursLoad()
      const refs: RumourPriceRef[] = []
      for (const r of load.rumours) {
        const it = mainItem(r)
        if (it) refs.push({ ns: it.ns, ref: it.ref, meta: it.meta })
      }
      let league: string | null = null
      try {
        league = await getEffectiveLeague()
      } catch {
        league = null
      }
      book = await collectPrices(SOURCES, refs, league, (id, e) => console.warn(`[rumours] цены ${id}:`, e))
      // ни одной цены (нет сети и снимка) — спросим снова через минуту, а не через 15
      at = Object.keys(book.quotes).length ? Date.now() : Date.now() - TTL_MS + 60_000
      return book
    } finally {
      pending = null
    }
  })()
  return pending
}
