// POETH (S47): фильтр для мода, которого нет в данных EE2 (новый патч), но который main нашёл в data/stats сайта
// trade2 (тот же формат совпадения FallbackMatch, что у PoE1 — src/shared/poe1/pricecheck/fallback.ts; индекс и
// разбор ответа сайта общие). Чистый код, без electron.

import type { FallbackMatch } from '../../poe1/pricecheck/fallback'
import { type ParsedItem, ItemRarity } from '../parser'
import { FilterTag, type StatFilter } from './filters/interfaces'
import { percentRoll } from './filters/util'

const NUM_RE = /[+-]?\d+(?:[.,]\d+)?/g
const TAGS = new Set<string>(Object.values(FilterTag))

/**
 * Фильтр «с сайта»: виден в окне с пометкой, выключен по умолчанию (кроме уников — как обычные явные моды у них),
 * мин. значение — −searchStatRange % от ролла (у отрицательных — макс. +searchStatRange %).
 */
export function fallbackToFilter(
  m: Pick<FallbackMatch, 'text' | 'tradeId' | 'type'> & Partial<Pick<FallbackMatch, 'label' | 'value'>>,
  item: ParsedItem,
  searchStatRange: number
): StatFilter {
  let value = m.value
  if (value === undefined) {
    const num = m.text.match(NUM_RE)?.[0]
    if (num !== undefined) value = Number(num.replace(',', '.'))
  }
  const negative = value !== undefined && value < 0
  return {
    tradeId: [m.tradeId],
    statRef: m.label ?? m.text.replace(NUM_RE, '#'),
    text: m.text.replace(NUM_RE, '#'),
    tag: TAGS.has(m.type) ? (m.type as FilterTag) : FilterTag.Explicit,
    sources: [],
    roll:
      value === undefined
        ? undefined
        : {
            value,
            min: negative ? undefined : percentRoll(value, -searchStatRange, Math.floor),
            max: negative ? percentRoll(value, +searchStatRange, Math.ceil) : undefined,
            default: {
              min: percentRoll(value, -searchStatRange, Math.floor),
              max: percentRoll(value, +searchStatRange, Math.ceil)
            },
            dp: !Number.isInteger(value),
            isNegated: false
          },
    fromSite: true,
    hidden: undefined,
    disabled: item.rarity !== ItemRarity.Unique
  }
}
