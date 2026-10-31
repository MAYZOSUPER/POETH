import { mainItem } from '@shared/rumours/schema'
import {
  EMPTY_PRICE_BOOK,
  collectPrices,
  stubPriceSource,
  type RumourPriceBook,
  type RumourPriceRef,
  type RumourPriceSource
} from '@shared/rumours/prices'
import { getEffectiveLeague } from '../net/leagues'
import { getRumoursLoad } from './data'

// Цены главных наград слухов (S65). Источники по порядку доверия:
//  1) фид обмена GGG `currency-exchange/poe2` — валюта по пути метаданных (обобщение фида — S61);
//  2) снимок poe.ninja PoE 2 из CI — камни, ключи, уникальные по имени (S67).
// Пока их нет в main — заглушка: цен нет, окно пишет «цена появится позже». Подключить — добавить источник в
// SOURCES (адаптер к их модулю, интерфейс RumourPriceSource в @shared/rumours/prices). Запросов при наведении нет:
// цены спрашиваем, когда окно слухов открыто, и держим 15 минут (фид — почасовой, снимок — ещё реже).

const SOURCES: RumourPriceSource[] = [stubPriceSource]
const TTL_MS = 15 * 60_000

let book: RumourPriceBook = EMPTY_PRICE_BOOK
let at = 0
let pending: Promise<RumourPriceBook> | null = null

/** Источники цен для тестов и будущих адаптеров S61/S67. */
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
      at = Date.now()
      return book
    } finally {
      pending = null
    }
  })()
  return pending
}
