// Источники цен главных наград слухов (S65; чистый модуль, tests/rumours/sources.test.ts) — адаптеры к готовым
// ценам PoE 2, своего формата цен здесь нет:
//  - «exchange» — цена у Ange по почасовому фиду обмена GGG (S61, @shared/poe2/pricecheck/ange): последний час со
//    сделками, главный рынок, в exalted по курсу лиги; курс ex/div и ex/chaos — оттуда же;
//  - «ninja» — снимок poe.ninja PoE 2 из пакета данных (S67, @shared/poe2/prices): цена по английскому имени.
// Откуда взять часы фида и снимок, решает main (rumours/prices.ts): сеть и диск — только там.

import type { FullHour } from '../flip/feed'
import { angePriceByName, poe2Rate } from '../poe2/pricecheck/ange'
import type { LoadedPoe2Prices } from '../poe2/prices/load'
import { itemRefKey } from './schema'
import type { RumourPriceQuote, RumourPriceSource, RumourRates } from './prices'

export interface ExchangeFeed {
  /** часы фида PoE 2 лиги */
  hours: readonly FullHour[]
  /** английское имя (нижний регистр) → id фида: feedIdsByName(exchange-ids.json) */
  byName: ReadonlyMap<string, readonly string[]>
}

/** Цена у Ange (фид обмена GGG). feed — часы лиги и имена; null — фида нет (сеть, лига). */
export function exchangePriceSource(feed: (league: string) => Promise<ExchangeFeed | null>): RumourPriceSource {
  return {
    id: 'exchange',
    async quote(refs, league) {
      const f = await feed(league)
      const rate = f ? poe2Rate(f.hours, league) : null
      const out: Record<string, RumourPriceQuote> = {}
      if (!f || !rate) return out
      for (const r of refs) {
        const p = angePriceByName(f.hours, league, f.byName, r.ref, rate)
        if (p && p.exalted > 0) {
          out[itemRefKey(r)] = { value: p.exalted, unit: 'exalted', source: 'exchange', at: new Date(p.hour).toISOString(), low: p.low }
        }
      }
      return out
    },
    async rates(league): Promise<Partial<RumourRates>> {
      const f = await feed(league)
      const rate = f ? poe2Rate(f.hours, league) : null
      return rate ? { divineInExalted: rate.exaltedPerDivine, chaosInExalted: rate.exaltedPerChaos ?? null } : {}
    }
  }
}

/** Снимок poe.ninja PoE 2 (пакет данных). load — снимок для лиги игрока; null — снимка нет. */
export function ninjaPriceSource(load: (league: string) => Promise<LoadedPoe2Prices | null>): RumourPriceSource {
  return {
    id: 'ninja',
    async quote(refs, league) {
      const p = await load(league)
      const out: Record<string, RumourPriceQuote> = {}
      if (!p) return out
      const at = new Date(p.at).toISOString()
      for (const r of refs) {
        const x = p.table.byName(r.ref)
        if (!x) continue
        if (x.exalted !== null && x.exalted > 0) out[itemRefKey(r)] = { value: x.exalted, unit: 'exalted', source: 'ninja', at, low: x.low }
        else if (x.divine !== null && x.divine > 0) out[itemRefKey(r)] = { value: x.divine, unit: 'divine', source: 'ninja', at, low: x.low }
      }
      return out
    },
    async rates(league): Promise<Partial<RumourRates>> {
      const p = await load(league)
      return { divineInExalted: p?.table.exaltedPerDivine ?? null }
    }
  }
}
