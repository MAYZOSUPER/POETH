// Прайс-чек PoE1 (порт фильтров и построителя запроса Awakened PoE Trade + своё): чистый TS без сети.
//
//   const item = (await parseItemText(text, store)).value
//   const d = await store.ensureLanguage(item.lang)
//   const pc = createPriceCheck(item, d, { league: 'Mercenaries' })
//   const preset = pc.presets.find((p) => p.id === pc.active)!
//   const req = buildRequest(item, d, preset)   // { api: 'trade', body } | { api: 'bulk', body }
//
// Запрос содержит только английские имена и trade id → одинаков для EN и RU клиента. Сеть, лимиты и
// кэш — в main (S3, tradeGateway).

import type { Poe1Data } from '../data/Poe1Data'
import type { ParsedItem } from '../parser'
import { createPresets, type CreatePresetsOptions } from './filters/create-presets'
import type { FilterPreset, TradeStatus } from './filters/interfaces'
import type { TimelessConquerorMode } from './filters/pseudo/timeless-jewel'
import { apiToSatisfySearch } from './query/common'
import { createTradeRequest, type TradeRequest } from './query/trade'
import { createBulkRequest, DEFAULT_BULK_HAVE, type BulkRequest } from './query/bulk'

export * from './filters/interfaces'
export { createPresets, type CreatePresetsOptions } from './filters/create-presets'
export { createFilters, type CreateOptions as CreateFiltersOptions } from './filters/create-item-filters'
export { createExactStatFilters, initUiModFilters, calculatedStatToFilter } from './filters/create-stat-filters'
export {
  TIMELESS_JEWELS,
  conquerorTradeId,
  describeTimeless,
  setTimelessConquerorMode,
  vilsolUrl,
  type TimelessConquerorMode,
  type TimelessJewelKind,
  type TimelessSearch
} from './filters/pseudo/timeless-jewel'
export { CATEGORY_TO_TRADE_ID, createTradeRequest, type TradeRequest } from './query/trade'
export {
  createBulkRequest,
  bulkStatus,
  bulkOffersByCurrency,
  DEFAULT_BULK_HAVE,
  type BulkRequest,
  type BulkStatus,
  type BulkSearchResult,
  type BulkOffer
} from './query/bulk'
export { apiToSatisfySearch, tradeTag } from './query/common'

export interface PriceCheckOptions {
  /** id лиги (как в /api/trade/data/leagues) */
  league: string
  /** статус листингов, по умолчанию `available` (instant buyout + in person) */
  status?: TradeStatus
  /** ± % от ролла для мин/макс модов, по умолчанию 10 */
  searchStatRange?: number
  currency?: string | null
  /** `api` — схлопывать листинги одного аккаунта на сайте (по умолчанию) */
  collapseListings?: 'api' | 'app'
  /** включать фильтр «размер стопки» для стопок > 1 */
  activateStockFilter?: boolean
  timelessConqueror?: TimelessConquerorMode
}

export const PRICE_CHECK_DEFAULTS = {
  status: 'available',
  searchStatRange: 10,
  currency: null,
  collapseListings: 'api',
  activateStockFilter: false
} as const satisfies Omit<PriceCheckOptions, 'league'>

export function resolvePriceCheckOptions(opts: PriceCheckOptions): CreatePresetsOptions {
  return {
    league: opts.league,
    status: opts.status ?? PRICE_CHECK_DEFAULTS.status,
    searchStatRange: opts.searchStatRange ?? PRICE_CHECK_DEFAULTS.searchStatRange,
    currency: opts.currency ?? PRICE_CHECK_DEFAULTS.currency,
    collapseListings: opts.collapseListings ?? PRICE_CHECK_DEFAULTS.collapseListings,
    activateStockFilter: opts.activateStockFilter ?? PRICE_CHECK_DEFAULTS.activateStockFilter,
    timelessConqueror: opts.timelessConqueror
  }
}

/** Пресеты фильтров для предмета (данные `d` — того же языка, что предмет: тексты фильтров для показа). */
export function createPriceCheck(
  item: ParsedItem,
  d: Poe1Data,
  opts: PriceCheckOptions
): { presets: FilterPreset[]; active: string } {
  if (item.lang !== d.lang) throw new Error(`Данные ${d.lang} не подходят предмету ${item.lang}`)
  return createPresets(item, d, resolvePriceCheckOptions(opts))
}

export type PriceCheckRequest =
  | { api: 'trade'; league: string; body: TradeRequest }
  | { api: 'bulk'; league: string; body: BulkRequest }

/** Готовый запрос по пресету: обычный поиск или bulk-обмен (если включённых фильтров модов нет и есть trade tag). */
export function buildRequest(
  item: ParsedItem,
  d: Poe1Data,
  preset: FilterPreset,
  have: readonly string[] = DEFAULT_BULK_HAVE
): PriceCheckRequest {
  const league = preset.filters.trade.league
  if (apiToSatisfySearch(item, preset.stats, preset.filters) === 'bulk') {
    return { api: 'bulk', league, body: createBulkRequest(preset.filters, item, have) }
  }
  return { api: 'trade', league, body: createTradeRequest(preset.filters, preset.stats, d) }
}
