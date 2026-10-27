// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/web/price-check/trade/common.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: только чистая часть (выбор API, tradeTag); лимиты и сеть — в main (S3, src/main/net).

import type { ParsedItem } from '../../parser'
import type { FilterOrGroup, ItemFilters } from '../filters/interfaces'

/** Какой API удовлетворит поиск: обычный (`/search`) или bulk-обмен (`/exchange`). */
export function apiToSatisfySearch(item: ParsedItem, stats: FilterOrGroup[], _filters: ItemFilters): 'trade' | 'bulk' {
  if (stats.some((s) => (s.group ? !s.meta.disabled : !s.disabled))) {
    return 'trade'
  }

  return tradeTag(item) != null ? 'bulk' : 'trade'
}

/** id предмета для bulk-обмена (`chaos`, `divine`, `the-incantation`…) — из данных, от языка не зависит. */
export function tradeTag(item: ParsedItem): string | undefined {
  return item.info.tradeTag
}

/** Простая запись по пути `a.b.c` (замена `dot-prop` из APT). */
export function propSet(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let obj = target
  for (const key of keys.slice(0, -1)) {
    if (typeof obj[key] !== 'object' || obj[key] === null) obj[key] = {}
    obj = obj[key] as Record<string, unknown>
  }
  obj[keys[keys.length - 1]] = value
}
