// POETH (S24): страховка «цена может быть выше» для редких. Поиск широкий (похожих много), цена низкая, а у
// предмета есть видимые неотмеченные свойства, которые обычно добавляют цену, — показываем строку «Цена может
// быть выше: не отмечены …» с кнопкой «Учесть и искать заново». Ничего не ищем сами: один клик — один поиск.
//
// Какие свойства предлагаем: видимые (не скрытые), не «не», не свойства базы; псевдо-суммы (жизнь, мана,
// сопротивления), моды без тира (гнёзда, имплициты) и моды хороших тиров (T1–T3). Слабые тиры (T4+) не
// предлагаем: с ними поиск просто сужается до нуля. Состав фильтров по умолчанию — не наш (S23), берём текущий.
// Чистый TS; tests/pricecheck/higher.test.ts.

import { ItemRarity, type ParsedItem } from '../parser'
import { FilterTag, type FilterPreset, type StatFilter } from './filters/interfaces'

/** ниже этой цены (chaos) — «цена низкая» */
export const HIGHER_MAX_CHAOS = 10
/** от стольких похожих — «поиск широкий» */
export const HIGHER_MIN_TOTAL = 100
/** хуже этого тира мод не предлагаем */
export const HIGHER_MAX_TIER = 3
/** сколько свойств предлагаем отметить за раз */
export const HIGHER_MAX_SUGGEST = 3

/** Тир мода (у псевдо и модов без тира — undefined). */
function tierOf(f: StatFilter): number | undefined {
  return f.sources[0]?.modifier.info.tier
}

/**
 * Неотмеченные видимые свойства, которые стоит предложить, — лучшие сверху: псевдо, потом без тира, потом по тиру.
 * Снимок на момент поиска (объекты фильтров — те же, что в окне).
 */
export function uncheckedValuable(preset: Pick<FilterPreset, 'stats'>): StatFilter[] {
  const rank = (f: StatFilter): number => (f.tag === FilterTag.Pseudo ? 0 : tierOf(f) === undefined ? 1 : 1 + tierOf(f)!)
  return preset.stats
    .filter((s): s is StatFilter => !s.group)
    .filter((f) => f.disabled && !f.hidden && !f.not && f.tag !== FilterTag.Property)
    .filter((f) => {
      const tier = tierOf(f)
      return f.tag === FilterTag.Pseudo || tier === undefined || tier <= HIGHER_MAX_TIER
    })
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map((x) => x.f)
}

export interface HigherHint {
  /** что предложить отметить (не больше HIGHER_MAX_SUGGEST) */
  filters: StatFilter[]
  /** сколько ещё таких же осталось за кадром */
  more: number
}

/**
 * Показывать ли «цена может быть выше»: редкий опознанный предмет, похожих много, цена низкая (известна в chaos)
 * и есть что отметить.
 */
export function priceMayBeHigher(args: {
  item: Pick<ParsedItem, 'rarity' | 'isUnidentified'>
  total: number
  /** chaos-эквивалент цены на рынке; неизвестен — не показываем */
  chaos: number | undefined
  /** uncheckedValuable на момент поиска */
  unchecked: readonly StatFilter[]
}): HigherHint | undefined {
  const { item, total, chaos, unchecked } = args
  if (item.rarity !== ItemRarity.Rare || item.isUnidentified) return undefined
  if (total < HIGHER_MIN_TOTAL || chaos == null || chaos >= HIGHER_MAX_CHAOS) return undefined
  const left = unchecked.filter((f) => f.disabled)
  if (!left.length) return undefined
  return { filters: left.slice(0, HIGHER_MAX_SUGGEST), more: Math.max(0, left.length - HIGHER_MAX_SUGGEST) }
}
