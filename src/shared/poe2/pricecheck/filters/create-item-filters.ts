// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/create-item-filters.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: в поля *Trade всегда идёт английское `refName` (у EE2 — по настройке `useEn`; у нас запрос
// одинаков для EN и RU клиента, локализованное имя — только для показа); данные языка параметром (`d.itemByRef`
// вместо ITEM_BY_REF); статус листингов по умолчанию `available` (у EE2 — `securable`); `currency` / `listed` —
// `null` вместо undefined; без `performance.mark` и полей редактора предметов (`itemEditorSelection`,
// `tempAugmentStorage`).

import type { Poe2Data } from '../../data/Poe2Data'
import type { BaseType } from '../../data/interfaces'
import { type ParsedItem, ItemCategory, ItemRarity, ModifierType, ARMOUR, GEM, WEAPON } from '../../parser'
import { tradeTag } from '../query/common'
import { CATEGORY_TO_TRADE_ID } from '../query/trade'
import { maxUsefulItemLevel } from './common'
import type { ItemFilters, ListingType } from './interfaces'

export const SPECIAL_SUPPORT_GEM = ['Empower Support', 'Enlighten Support', 'Enhance Support']

const CATEGORIES_WITH_USEFUL_QUALITY = new Set([
  ItemCategory.Flask,
  ItemCategory.Charm,
  ItemCategory.Tincture,
  ...WEAPON,
  ...ARMOUR
])

export interface CreateOptions {
  league: string
  currency: string | null
  /** статус листингов (по умолчанию в POETH — available) */
  listingType: ListingType | 'onlineleague' | undefined
  collapseListings: 'app' | 'api'
  activateStockFilter: boolean
  exact: boolean
}

export function createFilters(item: ParsedItem, d: Poe2Data, opts: CreateOptions): ItemFilters {
  const filters: ItemFilters = {
    searchExact: {},
    trade: {
      offline: false,
      onlineInLeague: false,
      listingType: opts.listingType ?? 'available',
      listed: null,
      currency: opts.currency,
      league: opts.league,
      collapseListings: opts.collapseListings
    }
  }

  if (item.category && GEM.has(item.category) && !tradeTag(item)) {
    return createGemFilters(item, d, filters)
  }
  if (item.category === ItemCategory.UncutGem) {
    return createUncutGemFilters(item, d, filters)
  }
  if (item.category === ItemCategory.Currency && item.trials) {
    return createTrialsFilters(item, filters)
  }
  if (item.category === ItemCategory.CapturedBeast) {
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: item.info.refName // NOTE: always English on trade
    }
    return filters
  }
  if (item.stackSize || tradeTag(item)) {
    filters.stackSize = {
      value: item.stackSize?.value || 1,
      disabled: !(item.stackSize && item.stackSize.value > 1 && opts.activateStockFilter)
    }
  }
  if (item.category === ItemCategory.Invitation) {
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: t(item.info)
    }
    return filters
  }
  if (item.category === ItemCategory.MetamorphSample) {
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: t(item.info)
    }
    filters.itemLevel = {
      value: item.itemLevel!,
      disabled: false
    }
    return filters
  }
  if (
    item.category === ItemCategory.DivinationCard ||
    item.category === ItemCategory.Currency ||
    item.info.refName === 'Charged Compass'
  ) {
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: t(item.info)
    }
    if (item.info.refName === 'Chronicle of Atzoatl') {
      filters.areaLevel = {
        value: floorToBracket(item.areaLevel!, [1, 68, 73, 75, 78, 80]),
        disabled: false
      }
    }
    if (item.info.refName === 'Mirrored Tablet' || item.info.refName === 'Forbidden Tome') {
      filters.areaLevel = {
        value: item.areaLevel!,
        disabled: false
      }
    }
    if (item.info.refName === 'Filled Coffin') {
      filters.itemLevel = {
        value: item.itemLevel!,
        disabled: false
      }
    }
    return filters
  }

  // "endgame" items (map-like items) (also uniques??)
  if (item.category === ItemCategory.Map) {
    if (item.rarity === ItemRarity.Unique && item.info.unique) {
      filters.searchExact = {
        name: item.info.name,
        nameTrade: t(item.info),
        baseTypeTrade: t(itemByRef(d, item.info.unique.base))
      }
    } else {
      filters.searchExact = {
        baseType: item.info.name,
        baseTypeTrade: t(item.info)
      }
      filters.searchRelaxed = {
        category: item.category,
        disabled: false
      }
    }

    if (item.mapBlighted) {
      filters.mapBlighted = { value: item.mapBlighted }
    }

    filters.mapTier = {
      value: item.mapTier!,
      disabled: false
    }
  } else if (item.info.refName === 'Expedition Logbook') {
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: t(item.info)
    }
    filters.areaLevel = {
      // Seems like flooring area level doesn't quite matter for poe2
      value: item.areaLevel!,
      disabled: false
    }
  } else if (item.category === ItemCategory.HeistBlueprint) {
    filters.searchRelaxed = {
      category: item.category,
      disabled: true // TODO: blocked by https://www.pathofexile.com/forum/view-thread/3109852
    }
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: t(item.info)
    }

    filters.areaLevel = {
      value: item.areaLevel!,
      disabled: false
    }

    if (item.heist?.wingsRevealed) {
      filters.heistWingsRevealed = {
        value: item.heist.wingsRevealed,
        disabled: false
      }
    }
  } else if (item.rarity === ItemRarity.Unique && item.info.unique) {
    filters.searchExact = {
      name: item.info.name,
      nameTrade: t(item.info),
      baseTypeTrade: t(itemByRef(d, item.info.unique.base))
    }
  } else {
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: t(item.info)
    }
    if (item.category && CATEGORY_TO_TRADE_ID.has(item.category)) {
      let disabled = opts.exact
      if (item.category === ItemCategory.ClusterJewel) {
        disabled = true
      } else if (item.category === ItemCategory.SanctumRelic || item.category === ItemCategory.Charm) {
        disabled = false
      }
      filters.searchRelaxed = {
        category: item.category,
        disabled
      }
    }
  }

  if (item.sentinelCharge != null) {
    filters.sentinelCharge = {
      value: item.sentinelCharge,
      disabled: false
    }
  }

  if (item.quality) {
    if (item.quality >= 20 && item.category === ItemCategory.Flask) {
      // show if 20 but only enable if greater than 20
      filters.quality = {
        value: item.quality,
        disabled: item.quality <= 20
      }
    } else if (
      // Require Exceptional quality for non-flasks (most will be 20 anyways so can be ignored)
      item.quality > 20 &&
      item.category &&
      CATEGORIES_WITH_USEFUL_QUALITY.has(item.category)
    ) {
      filters.quality = {
        value: item.quality,
        // Not by default if rare, since most of craft is likely already done (and don't care about it on finished items)
        disabled: item.rarity === ItemRarity.Rare
      }
    } else if (item.category === ItemCategory.Charm) {
      filters.quality = {
        value: item.quality,
        disabled: item.quality < 10
      }
    }
  }

  if (item.gemSockets?.linked) {
    filters.linkedSockets = {
      value: item.gemSockets.linked,
      disabled: false
    }
  }

  if (item.gemSockets?.white) {
    filters.whiteSockets = {
      value: item.gemSockets.white,
      disabled: false
    }
  }

  if (item.augmentSockets) {
    if (item.augmentSockets.current) {
      filters.augmentSockets = {
        value: item.augmentSockets.current,
        disabled: item.augmentSockets.current <= item.augmentSockets.normal && !item.isCorrupted
      }
    }
  }

  if (item.requires && item.rarity === ItemRarity.Rare && !opts.exact) {
    if (item.requires.level && item.requires.level <= 75 && item.itemLevel && item.itemLevel <= 75) {
      filters.requires = {
        level: {
          value: item.requires.level,
          disabled: true
        }
      }
    }
  }

  const forAdornedJewel =
    item.rarity === ItemRarity.Magic &&
    // item.isCorrupted && -- let the buyer corrupt
    (item.category === ItemCategory.Jewel || item.category === ItemCategory.AbyssJewel)

  if (
    !item.isUnmodifiable &&
    // Ignore waystones now(prev tablets) since if  there is one that is corrupted with right mods buyer wont care
    item.category !== ItemCategory.Map &&
    (item.rarity === ItemRarity.Normal ||
      item.rarity === ItemRarity.Magic ||
      item.rarity === ItemRarity.Rare ||
      item.rarity === ItemRarity.Unique)
  ) {
    filters.corrupted = {
      value: item.isCorrupted,
      exact: forAdornedJewel
    }
  }

  if (forAdornedJewel) {
    filters.rarity = {
      value: 'magic'
    }
  } else if (item.rarity === ItemRarity.Normal && item.info.refName !== 'Idol of Estazunti' && opts.exact) {
    // Since chance orbs only work on normal items
    filters.rarity = {
      value: 'normal'
    }
  } else if (
    item.rarity === ItemRarity.Magic &&
    opts.exact &&
    // Ignore tablet since they should be compared to rare ones
    item.category !== ItemCategory.Tablet
  ) {
    filters.rarity = {
      value: 'magic'
    }
  } else if (
    item.rarity === ItemRarity.Normal ||
    item.rarity === ItemRarity.Magic ||
    item.rarity === ItemRarity.Rare
  ) {
    filters.rarity = {
      value: 'nonunique'
    }
  }

  if (item.isMirrored) {
    filters.mirrored = { disabled: false }
  }

  if (item.isSanctified) {
    filters.sanctified = { disabled: false }
  }

  if (!item.isFractured && opts.exact) {
    filters.fractured = { value: false }
  }

  if (item.isFoil) {
    filters.foil = { disabled: true }
  }

  if (item.influences.length && item.influences.length <= 2) {
    filters.influences = item.influences.map((influence) => ({
      value: influence,
      disabled: !opts.exact
    }))
  }

  if (item.itemLevel) {
    if (
      maxUsefulItemLevel(item.category) !== 1 &&
      item.rarity !== ItemRarity.Unique &&
      item.category !== ItemCategory.Map &&
      item.category !== ItemCategory.HeistBlueprint &&
      item.category !== ItemCategory.HeistContract &&
      item.category !== ItemCategory.MemoryLine &&
      item.info.refName !== 'Expedition Logbook'
    ) {
      if (item.category === ItemCategory.ClusterJewel) {
        filters.itemLevel = {
          value: floorToBracket(item.itemLevel, [1, 50, 68, 75, 84]),
          max: ceilToBracket(item.itemLevel, [100, 74, 67, 49]),
          disabled: !opts.exact
        }
      } else {
        // TODO limit level by item type
        filters.itemLevel = {
          value: Math.min(item.itemLevel, maxUsefulItemLevel(item.category)),
          disabled: !opts.exact || item.category === ItemCategory.Flask || item.category === ItemCategory.Charm
        }
      }
    }

    if (item.rarity === ItemRarity.Unique) {
      if (item.isUnidentified && item.info.refName === "Watcher's Eye") {
        filters.itemLevel = {
          value: item.itemLevel,
          disabled: false
        }
      }

      if (
        item.itemLevel >= 75 &&
        ['Agnerod', 'Agnerod East', 'Agnerod North', 'Agnerod South', 'Agnerod West'].includes(item.info.refName)
      ) {
        // https://pathofexile.gamepedia.com/The_Vinktar_Square
        const normalizedLvl = item.itemLevel >= 82 ? 82 : item.itemLevel >= 80 ? 80 : item.itemLevel >= 78 ? 78 : 75

        filters.itemLevel = {
          value: normalizedLvl,
          disabled: false
        }
      }
    }
  }

  if (item.isUnidentified) {
    if (item.unidentifiedTier) {
      filters.unidentifiedTier = {
        value: item.unidentifiedTier,
        disabled: item.unidentifiedTier < 5
      }
    } else {
      filters.unidentified = {
        value: true,
        disabled: item.rarity !== ItemRarity.Unique
      }
    }
  }

  if (item.isVeiled) {
    filters.veiled = {
      statRefs: item.statsByType.filter((calc) => calc.type === ModifierType.Veiled).map((calc) => calc.stat.ref),
      veiledCount: item.newMods.filter((m) => m.info.type === ModifierType.Veiled).length,
      disabled: item.rarity !== ItemRarity.Unique
    }

    if (item.rarity !== ItemRarity.Unique) {
      if (filters.itemLevel) {
        filters.itemLevel.disabled = false
      }
    }
  }

  return filters
}

function createGemFilters(item: ParsedItem, d: Poe2Data, filters: ItemFilters) {
  if (!item.info.gem!.transfigured) {
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: t(item.info)
    }
  } else {
    const normalGem = d.itemByRef('GEM', item.info.gem!.normalVariant!)?.[0]
    filters.searchExact = {
      baseType: item.info.name,
      baseTypeTrade: normalGem ? t(normalGem) : item.info.gem!.normalVariant!
    }
    filters.discriminator = {
      trade: item.info.tradeDisc!
    }
  }

  filters.corrupted = {
    value: item.isCorrupted
  }

  if (item.info.gem!.awakened) {
    filters.gemLevel = {
      value: item.gemLevel!,
      disabled: item.gemLevel! < 5
    }

    if (item.isCorrupted && item.quality) {
      filters.quality = {
        value: item.quality,
        disabled: item.quality < 20
      }
    }

    return filters
  }

  if (SPECIAL_SUPPORT_GEM.includes(item.info.refName)) {
    filters.gemLevel = {
      value: item.gemLevel!,
      disabled: item.gemLevel! < 3
    }

    if (item.isCorrupted && item.quality) {
      filters.quality = {
        value: item.quality,
        disabled: true
      }
    }

    return filters
  }

  if (item.gemSockets) {
    filters.socketNumber = {
      value: item.gemSockets.number,
      disabled: item.gemSockets.number < 3
    }
  }

  if (item.quality) {
    filters.quality = {
      value: item.quality,
      disabled: item.quality < 16
    }
  }

  filters.gemLevel = {
    value: item.gemLevel!,
    disabled: item.gemLevel! < 19
  }

  return filters
}

export function createUncutGemFilters(item: ParsedItem, d: Poe2Data, filters: ItemFilters) {
  const normalGem = itemByRef(d, item.info.refName)
  filters.searchExact = {
    baseType: item.info.name,
    baseTypeTrade: t(normalGem)
  }
  const range = item.gemLevel! < 18 && item.info.refName !== 'Uncut Support Gem' ? 1 : 0

  filters.gemLevel = {
    value: item.gemLevel! - range,
    disabled: false
  }
  if (range) {
    filters.gemLevel.max = item.gemLevel! + range
  }

  return filters
}

export function createTrialsFilters(item: ParsedItem, filters: ItemFilters) {
  const refName = item.info.refName
  filters.searchExact = {
    baseType: item.info.name,
    baseTypeTrade: t(item.info)
  }
  const fixedAreaLevel = ascendancyPointsByAreaLevel(refName, item.areaLevel!)

  filters.awardedAscendancyPoints = {
    value: fixedAreaLevel,
    disabled: false
  }

  filters.areaLevel = {
    value: item.areaLevel!,
    disabled: false
  }

  if (refName === 'Inscribed Ultimatum' && item.trials?.ultimatumHint) {
    filters.ultimatumHint = {
      value: item.trials.ultimatumHint,
      disabled: true
    }
  }

  return filters
}

const ASCENDANCY_POINTS: Record<string, Record<number, number>> = {
  'Inscribed Ultimatum': {
    1: 1,
    2: 60,
    3: 75
  },
  'Djinn Barya': {
    1: 1,
    2: 45,
    3: 60,
    4: 75
  }
}

export function areaLevelByAscendancyPoints(refName: string, points: number) {
  if (!(refName in ASCENDANCY_POINTS)) {
    return 0
  }

  const maxPossiblePoints = refName === 'Inscribed Ultimatum' ? 3 : 4
  // cases not possible
  if (points < 1) {
    return 1
  } else if (points > maxPossiblePoints) {
    return 75
  }

  const trialLevels = ASCENDANCY_POINTS[refName]

  return trialLevels[points]
}

export function ascendancyPointsByAreaLevel(refName: string, areaLevel: number) {
  if (!(refName in ASCENDANCY_POINTS)) {
    return 0
  }

  const maxPossiblePoints = refName === 'Inscribed Ultimatum' ? 3 : 4

  // cases not possible
  if (areaLevel < 1) {
    return 1
  } else if (areaLevel > 80) {
    return maxPossiblePoints
  }

  for (let i = maxPossiblePoints; i >= 1; i--) {
    if (areaLevel >= ASCENDANCY_POINTS[refName][i]) {
      return i
    }
  }

  return 1
}

/** POETH: в запрос — всегда английское имя (у EE2: `opts.useEn ? refName : name`). */
function t(info: Pick<BaseType, 'refName'>) {
  return info.refName
}

/** База по английскому имени (EE2: `ITEM_BY_REF("ITEM", ref)![0]`); если записи нет — само имя. */
function itemByRef(d: Poe2Data, refName: string): Pick<BaseType, 'refName'> {
  return d.itemByRef('ITEM', refName)?.[0] ?? { refName }
}

export function floorToBracket(value: number, brackets: readonly number[]) {
  let prev = brackets[0]
  for (const num of brackets) {
    if (num > value) {
      return prev
    } else {
      prev = num
    }
  }
  return prev
}

function ceilToBracket(value: number, brackets: readonly number[]) {
  let prev = brackets[0]
  for (const num of brackets) {
    if (num < value) {
      return prev
    } else {
      prev = num
    }
  }
  return prev
}
