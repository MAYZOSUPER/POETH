// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/trade/common.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: только чистая часть (выбор API, tradeTag); лимиты, кэш и сеть — в main (шлюз S3, src/main/net).

import { type ParsedItem, ItemCategory } from '../../parser'
import type { ItemFilters, StatFilter } from '../filters/interfaces'

export { propSet } from '../../../poe1/pricecheck/query/common'

/** Какой API удовлетворит поиск: обычный (`/api/trade2/search`) или обмен (`/api/trade2/exchange`). */
export function apiToSatisfySearch(item: ParsedItem, stats: StatFilter[], filters: ItemFilters): 'trade' | 'bulk' {
  if (stats.some((s) => !s.disabled)) {
    return 'trade'
  }

  if (filters.stackSize) {
    if (item.category === ItemCategory.DivinationCard || item.category === ItemCategory.Map) {
      return filters.stackSize.disabled ? 'trade' : 'bulk'
    }
  }

  return tradeTag(item) != null ? 'bulk' : 'trade'
}

/** id предмета для обмена (`divine`, `exalted`, `essence-of-enhancement`…) — из данных, от языка не зависит. */
export function tradeTag(item: ParsedItem): string | undefined {
  return item.info.tradeTag
}
