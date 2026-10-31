// POETH (S61, хвост S47): предупреждения окна цены PoE 2 «цена может быть не про ваш предмет» — те же жёлтые строки,
// что у PoE 1 (S15, shared/poe1/pricecheck/warnings.ts: те же чистые проверки и строки pc1.warn.*), только по тому,
// что уже пришло в ответе search/fetch trade2 (новых запросов нет):
//   corrupted — осквернённость предмета не как у большинства лотов (сильное: заметку цены не даём);
//   broad     — у редкого снято почти всё / сайт добавил похожие;
//   fixing    — дешёвые лоты держат 1–2 продавца;
//   old       — большинство дешёвых лотов висит больше недели.
// Чего нет у PoE 2: связей гнёзд (их в PoE 2 нет), Foulborn; варианты по рунам и гнёздам по ответу fetch trade2 пока
// не сравниваем (формы гнёзд trade2 в наших ответах нет — сделать по захватам, когда будут). Чистый TS;
// tests/poe2/warnings.test.ts.

import {
  broadWarning,
  corruptedWarning,
  fixingWarning,
  keptListings,
  oldWarning,
  WARNING_ORDER,
  type PriceWarning
} from '../../poe1/pricecheck/warnings'
import type { HonestPrice, Poe1Listing } from '../../poe1/pricecheck/results'
import { ItemRarity, type ParsedItem } from '../parser'
import { FilterTag, type FilterPreset, type StatFilter } from './filters/interfaces'

export { hasStrongWarning, VISIBLE_WARNINGS, type PriceWarning } from '../../poe1/pricecheck/warnings'

/** Свойства пресета PoE 2, которые игрок может отметить (без скрытых, «не», свойств базы и псевдо). */
function modFilters(preset: Pick<FilterPreset, 'stats'>): StatFilter[] {
  return preset.stats.filter((s) => !s.hidden && !(s as { not?: boolean }).not && s.tag !== FilterTag.Property && s.tag !== FilterTag.Pseudo)
}

/** Сколько свойств отмечено из скольких (для «поиск слишком широкий»). */
export function checkedMods2(preset: Pick<FilterPreset, 'stats'>): { on: number; all: number } {
  const mods = modFilters(preset)
  return { on: mods.filter((f) => !f.disabled).length, all: mods.length }
}

/** Что было включено в момент поиска (фильтры мутабельны: правки до «Искать заново» старый результат не меняют). */
export interface SearchContext2 {
  /** у предмета есть фильтр осквернённости */
  corruptedFilter: boolean
  mods: { on: number; all: number }
}

export function searchContext2(preset: Pick<FilterPreset, 'stats' | 'filters'>): SearchContext2 {
  return { corruptedFilter: preset.filters.corrupted != null, mods: checkedMods2(preset) }
}

export interface Warnings2Input extends SearchContext2 {
  item: Pick<ParsedItem, 'isCorrupted' | 'rarity' | 'isUnidentified'>
  listings: readonly Poe1Listing[]
  honest?: HonestPrice
  inexact: boolean
  /** отмечено свойств сразу после Ctrl+D */
  defaultOn?: number
  now: number
}

export function poe2Warnings(input: Warnings2Input): PriceWarning[] {
  const { item } = input
  const lots = keptListings(input.listings, input.honest)
  // редкость PoE 2 — те же строки 'Rare'/'Unique', что у PoE 1: проверка «широкого поиска» общая
  const rarity = item.rarity === ItemRarity.Rare ? 'Rare' : item.rarity
  const found = [
    corruptedWarning(item, input.corruptedFilter, lots),
    broadWarning({ inexact: input.inexact, item: { rarity: rarity as never, isUnidentified: item.isUnidentified }, mods: input.mods, defaultOn: input.defaultOn }),
    fixingWarning(lots),
    oldWarning(lots, input.now)
  ].filter((w): w is PriceWarning => w != null)
  return found.sort((a, b) => WARNING_ORDER.indexOf(a.kind) - WARNING_ORDER.indexOf(b.kind))
}
