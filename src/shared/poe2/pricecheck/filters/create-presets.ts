// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/create-presets.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: данные языка параметром; опции — тип CreatePresetsOptions (без `useEn`: в запрос всегда идут
// английские имена); ветка Expedition Logbook (`refName === "logbook here"`, у EE2 мёртвая) не перенесена;
// автозаполнение пустых гнёзд рунами (закомментировано у EE2, редактор предметов) — тоже.

import type { Poe2Data } from '../../data/Poe2Data'
import { type ParsedItem, ItemCategory, ItemRarity } from '../../parser'
import { createFilters, type CreateOptions as CreateFiltersOptions } from './create-item-filters'
import { createExactStatFilters, initUiModFilters } from './create-stat-filters'
import type { FilterPreset } from './interfaces'
import { hasCraftingValue, likelyFinishedItem } from './common'
import { createUniquePresets, PRESET_UNIQUES } from './create-unique-filters'

export type CreatePresetsOptions = Omit<CreateFiltersOptions, 'exact'> & {
  /** ± % от ролла для мин/макс фильтров модов (по умолчанию — 10, как у EE2) */
  searchStatRange: number
  /** включить все видимые фильтры (настройка EE2 «defaultAllSelected», по умолчанию выключена) */
  defaultAllSelected: boolean
}

export function createPresets(
  item: ParsedItem,
  d: Poe2Data,
  opts: CreatePresetsOptions
): { presets: FilterPreset[]; active: string } {
  if (
    item.isUnidentified ||
    item.rarity === ItemRarity.Normal ||
    (!item.info.craftable && item.rarity !== ItemRarity.Unique) ||
    ((item.category === ItemCategory.Flask ||
      item.category === ItemCategory.Relic ||
      item.category === ItemCategory.Tincture ||
      item.category === ItemCategory.MemoryLine ||
      item.category === ItemCategory.Invitation ||
      item.category === ItemCategory.HeistContract ||
      item.category === ItemCategory.HeistBlueprint ||
      item.category === ItemCategory.Sentinel ||
      item.category === ItemCategory.Tablet ||
      item.category === ItemCategory.Wombgift) &&
      item.rarity !== ItemRarity.Unique) ||
    (item.category === ItemCategory.Currency && item.trials?.numberOfTrials)
  ) {
    return {
      active: 'filters.preset_exact',
      presets: [
        {
          id: 'filters.preset_exact',
          filters: createFilters(item, d, { ...opts, exact: true }),
          stats: createExactStatFilters(item, d, item.statsByType, opts)
        }
      ]
    }
  }

  if (PRESET_UNIQUES.has(item.info.refName)) {
    return createUniquePresets(item, d, opts)
  }

  const pseudoPreset: FilterPreset = {
    id: 'filters.preset_pseudo',
    filters: createFilters(item, d, { ...opts, exact: false }),
    stats: initUiModFilters(item, d, opts)
  }

  if (likelyFinishedItem(item) || !hasCraftingValue(item)) {
    return { active: pseudoPreset.id, presets: [pseudoPreset] }
  }

  const baseItemPreset: FilterPreset = {
    id: 'filters.preset_base_item',
    filters: createFilters(item, d, { ...opts, exact: true }),
    stats: createExactStatFilters(item, d, item.statsByType, opts)
  }

  return {
    active: pseudoPreset.id,
    presets: [pseudoPreset, baseItemPreset]
  }
}
