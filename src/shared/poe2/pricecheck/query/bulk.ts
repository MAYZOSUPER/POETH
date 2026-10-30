// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/trade/pathofexile-bulk.ts (createTradeRequest) и выбор валют `have` из
// renderer/src/web/price-check/trade/bulk-api.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: только чистая часть — тело POST /api/trade2/exchange/<league> (сеть, лимиты, кэш и разбор
// ответа — main/лид); функция названа createBulkRequest; фильтры не мутируются: `available` / `securable` у обмена
// превращаются в `online` при сборке тела (EE2 переписывает filters.trade.listingType в CheckedItem.vue);
// за саму себя валюту не покупают (`have` без `want`, как у PoE1).

import type { ParsedItem } from '../../parser'
import type { ItemFilters } from '../filters/interfaces'
import { tradeTag } from './common'

export type BulkStatus = 'online' | 'onlineleague' | 'any'

export interface BulkRequest {
  engine: 'new'
  query: {
    status: { option: BulkStatus }
    have: string[]
    want: string[]
    minimum?: number
    fulfillable?: null
  }
  sort: { have: 'asc' }
}

/** Чем платим по умолчанию (trade tags валюты trade2) — как EE2 для обычного предмета. */
export const DEFAULT_BULK_HAVE: readonly string[] = ['divine', 'exalted', 'chaos']

/**
 * Валюты оплаты как у EE2 (bulk-api.ts): для трёх основных валют — две другие (в начале лиги многие выставляют
 * их по неверной цене, это ломает «оптимистичный» поиск), для остального — DEFAULT_BULK_HAVE.
 */
export function bulkHaveFor(item: ParsedItem): readonly string[] {
  switch (item.info.refName) {
    case 'Exalted Orb':
      return ['divine', 'chaos']
    case 'Chaos Orb':
      return ['divine', 'exalted']
    case 'Divine Orb':
      return ['exalted', 'chaos']
    default:
      return DEFAULT_BULK_HAVE
  }
}

/** Статус обмена: мгновенного выкупа у обмена нет — `available` / `securable` → продавцы в игре. */
export function bulkStatus(listingType: ItemFilters['trade']['listingType']): BulkStatus {
  if (listingType === 'any' || listingType === 'onlineleague') return listingType
  return 'online'
}

/** Тело запроса обмена trade2; `want` — trade tag предмета (от языка не зависит). */
export function createBulkRequest(filters: ItemFilters, item: ParsedItem, have?: readonly string[]): BulkRequest {
  const want = tradeTag(item)
  if (!want) throw new Error(`Предмет не торгуется через обмен: ${item.info.refName}`)
  const pay = (have ?? bulkHaveFor(item)).filter((h) => h !== want)
  return {
    engine: 'new',
    query: {
      have: pay.length ? pay : bulkHaveFor(item).filter((h) => h !== want),
      want: [want],
      status: {
        option: bulkStatus(filters.trade.listingType)
      },
      minimum: filters.stackSize && !filters.stackSize.disabled ? filters.stackSize.value : undefined
      // fulfillable: null
    },
    sort: { have: 'asc' }
  }
}
