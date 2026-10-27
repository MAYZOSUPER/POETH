// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/create-presets.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: данные языка параметром; пресеты Expedition Logbook и Mercenary Warrant отложены
// (для них — общий exact-пресет); в пресете — сведения о timeless-джуэле (режим завоевателя, Vilsol).

import type { Poe1Data } from '../../data/Poe1Data'
import { type ParsedItem, ItemCategory, ItemRarity } from '../../parser'
import { ModifierType } from '../../parser/modifiers'
import { createFilters, type CreateOptions as CreateFiltersOptions } from './create-item-filters'
import { createExactStatFilters, initUiModFilters } from './create-stat-filters'
import type { FilterPreset } from './interfaces'
import { describeTimeless, type TimelessConquerorMode } from './pseudo/timeless-jewel'

export type CreatePresetsOptions = Omit<CreateFiltersOptions, 'exact'> & {
  /** ± % от ролла для мин/макс фильтров модов (по умолчанию в POETH — 10) */
  searchStatRange: number
  /** timeless: режим завоевателя (по умолчанию — по типу джуэла) */
  timelessConqueror?: TimelessConquerorMode
}

export function createPresets(
  item: ParsedItem,
  d: Poe1Data,
  opts: CreatePresetsOptions
): { presets: FilterPreset[]; active: string } {
  if (
    (!item.info.craftable && item.rarity !== ItemRarity.Unique) ||
    item.isUnidentified ||
    item.rarity === ItemRarity.Normal ||
    (item.category === ItemCategory.Flask && item.rarity !== ItemRarity.Unique) ||
    (item.category === ItemCategory.Tincture && item.rarity !== ItemRarity.Unique) ||
    (item.category === ItemCategory.SanctumRelic && item.rarity !== ItemRarity.Unique) ||
    (item.category === ItemCategory.Idol && item.rarity !== ItemRarity.Unique) ||
    item.category === ItemCategory.Charm ||
    item.category === ItemCategory.Map ||
    item.category === ItemCategory.MemoryLine ||
    item.category === ItemCategory.Invitation ||
    item.category === ItemCategory.HeistContract ||
    item.category === ItemCategory.HeistBlueprint ||
    item.category === ItemCategory.Chart ||
    item.category === ItemCategory.Sentinel
  ) {
    if (
      item.rarity !== ItemRarity.Unique &&
      ((item.category === ItemCategory.Map && !item.mapCompletionReward) || item.category === ItemCategory.Chart)
    ) {
      const bulkPreset: FilterPreset = {
        id: 'filters.preset_bulk',
        filters: createFilters(item, d, { ...opts, exact: true }),
        stats: createExactStatFilters(item, d, item.statsByType, { ...opts, mode: 'bulk' })
      }
      if (item.rarity === ItemRarity.Rare && !item.isUnidentified && !item.info.area?.blighted) {
        const propsPreset: FilterPreset = {
          id: 'filters.preset_pseudo',
          filters: createFilters(item, d, { ...opts, exact: true }),
          stats: createExactStatFilters(item, d, item.statsByType, { ...opts, mode: 'props' })
        }
        return {
          active: item.category === ItemCategory.Chart && item.mapArea?.area?.special ? bulkPreset.id : propsPreset.id,
          presets: [propsPreset, bulkPreset]
        }
      } else {
        return { active: bulkPreset.id, presets: [bulkPreset] }
      }
    }

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

  const pseudoPreset: FilterPreset = {
    id: 'filters.preset_pseudo',
    filters: createFilters(item, d, { ...opts, exact: false }),
    stats: initUiModFilters(item, d, opts),
    timeless: describeTimeless(item, opts.timelessConqueror)
  }
  if (!pseudoPreset.timeless) delete pseudoPreset.timeless

  const likelyFinishedItem =
    item.rarity === ItemRarity.Unique ||
    item.statsByType.some((calc) => calc.type === ModifierType.Crafted) ||
    (item.quality === 20 && !item.memoryStrands) || // quality > 20 can be used for selling bases, quality < 20 drops sometimes
    item.isCorrupted ||
    item.isMirrored

  const hasCraftingValue =
    item.isSynthesised ||
    item.isFractured ||
    item.influences.length ||
    item.category === ItemCategory.ClusterJewel ||
    (item.category === ItemCategory.Jewel && item.rarity === ItemRarity.Magic) ||
    (item.category !== ItemCategory.Jewel && item.category !== ItemCategory.AbyssJewel && item.itemLevel! >= 82)

  if (likelyFinishedItem || !hasCraftingValue) {
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
