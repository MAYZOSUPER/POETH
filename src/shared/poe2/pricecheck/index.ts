// Прайс-чек PoE2 (порт фильтров и построителя запроса trade2 из Exiled Exchange 2): чистый TS без сети.
//
//   const item = (await parseItemText(text, store)).value
//   const d = await store.ensureLanguage(item.lang)
//   const pc = createPriceCheck(item, d, { league: 'Rise of the Abyssal' })
//   const preset = pc.presets.find((p) => p.id === pc.active)!
//   const req = buildRequest(item, d, preset)   // { api: 'trade', body } | { api: 'bulk', body }
//
// Запрос содержит только английские имена и trade id → одинаков для EN и RU клиента. Сеть (/api/trade2/search,
// /api/trade2/exchange), лимиты и кэш — в main (шлюз S3); разбор ответа — у окна цены.
//
// Настройки EE2 (AppConfig «price-check») → параметры PriceCheckOptions с умолчаниями:
//   listingType (у EE2 — filters.trade.listingType, по умолчанию securable) → `available` (как у PoE1);
//   searchStatRange → 10; collapseListings → `api`; activateStockFilter → false; defaultAllSelected → false;
//   currency (rememberCurrency) → null; useEn → нет (в запрос всегда английские имена);
//   rememberListingType / smartInitialSearch / autoFillEmptyAugmentSockets — забота окна, сюда не переносятся.

import type { Poe2Data } from '../data/Poe2Data'
import type { ParsedItem } from '../parser'
import { createPresets, type CreatePresetsOptions } from './filters/create-presets'
import type { FilterPreset, ListingType } from './filters/interfaces'
import { apiToSatisfySearch } from './query/common'
import { createTradeRequest, type TradeRequest } from './query/trade'
import { createBulkRequest, type BulkRequest } from './query/bulk'

export * from './filters/interfaces'
export { createPresets, type CreatePresetsOptions } from './filters/create-presets'
export { createFilters, type CreateOptions as CreateFiltersOptions } from './filters/create-item-filters'
export { createExactStatFilters, initUiModFilters, calculatedStatToFilter } from './filters/create-stat-filters'
export { PRESET_UNIQUES } from './filters/create-unique-filters'
export { CATEGORY_TO_TRADE_ID, createTradeRequest, tradeStatus, type TradeRequest } from './query/trade'
export {
  createBulkRequest,
  bulkHaveFor,
  bulkStatus,
  DEFAULT_BULK_HAVE,
  type BulkRequest,
  type BulkStatus
} from './query/bulk'
export { apiToSatisfySearch, tradeTag } from './query/common'
export { fallbackToFilter } from './fallback'

export interface PriceCheckOptions {
  /** id лиги (как в /api/trade2/data/leagues) */
  league: string
  /** статус листингов, по умолчанию `available` (мгновенный выкуп + продавцы в игре) */
  listingType?: ListingType
  /** ± % от ролла для мин/макс модов, по умолчанию 10 */
  searchStatRange?: number
  /** валюта цены (`exalted`, `divine`, `chaos`, `exalted_divine`…), по умолчанию — любая */
  currency?: string | null
  /** `api` — схлопывать листинги одного аккаунта на сайте (по умолчанию) */
  collapseListings?: 'api' | 'app'
  /** включать фильтр «размер стопки» для стопок > 1 (EE2: activateStockFilter, по умолчанию выключен) */
  activateStockFilter?: boolean
  /** включать все видимые фильтры модов (EE2: defaultAllSelected, по умолчанию выключено) */
  defaultAllSelected?: boolean
}

export const PRICE_CHECK_DEFAULTS = {
  listingType: 'available',
  searchStatRange: 10,
  currency: null,
  collapseListings: 'api',
  activateStockFilter: false,
  defaultAllSelected: false
} as const satisfies Omit<PriceCheckOptions, 'league'>

export function resolvePriceCheckOptions(opts: PriceCheckOptions): CreatePresetsOptions {
  return {
    league: opts.league,
    listingType: opts.listingType ?? PRICE_CHECK_DEFAULTS.listingType,
    searchStatRange: opts.searchStatRange ?? PRICE_CHECK_DEFAULTS.searchStatRange,
    currency: opts.currency ?? PRICE_CHECK_DEFAULTS.currency,
    collapseListings: opts.collapseListings ?? PRICE_CHECK_DEFAULTS.collapseListings,
    activateStockFilter: opts.activateStockFilter ?? PRICE_CHECK_DEFAULTS.activateStockFilter,
    defaultAllSelected: opts.defaultAllSelected ?? PRICE_CHECK_DEFAULTS.defaultAllSelected
  }
}

/** Пресеты фильтров для предмета (данные `d` — того же языка, что предмет: тексты фильтров для показа). */
export function createPriceCheck(
  item: ParsedItem,
  d: Poe2Data,
  opts: PriceCheckOptions
): { presets: FilterPreset[]; active: string } {
  if (item.lang !== d.lang) throw new Error(`Данные ${d.lang} не подходят предмету ${item.lang}`)
  return createPresets(item, d, resolvePriceCheckOptions(opts))
}

export type PriceCheckRequest =
  | { api: 'trade'; league: string; body: TradeRequest }
  | { api: 'bulk'; league: string; body: BulkRequest }

/**
 * Готовый запрос по пресету: поиск trade2 или обмен (если включённых фильтров модов нет и есть trade tag).
 * `have` — чем платим на обмене; по умолчанию как у EE2 (bulkHaveFor: divine / exalted / chaos без самой валюты).
 */
export function buildRequest(
  item: ParsedItem,
  d: Poe2Data,
  preset: FilterPreset,
  have?: readonly string[]
): PriceCheckRequest {
  const league = preset.filters.trade.league
  if (apiToSatisfySearch(item, preset.stats, preset.filters) === 'bulk') {
    return { api: 'bulk', league, body: createBulkRequest(preset.filters, item, have) }
  }
  return { api: 'trade', league, body: createTradeRequest(preset.filters, preset.stats, item, d) }
}
