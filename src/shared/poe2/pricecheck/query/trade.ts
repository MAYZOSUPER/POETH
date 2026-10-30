// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/trade/pathofexile-trade.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: только чистая часть до сети — тело POST /api/trade2/search/<league> (createTradeRequest,
// CATEGORY_TO_TRADE_ID, getMinMax / tradeIdToQuery / nameToQuery, фильтр дубликатов Mageblood); сеть, лимиты, кэш,
// разбор ответа fetch (parseFetchResult и пр.), poe.ninja — не переносятся (main/лид). Данные языка параметром
// (`d.statByRef` вместо STAT_BY_REF; trade id от языка не зависят); фильтры не мутируются (`onlineleague` у поиска
// → `securable` только в теле, как делает EE2); `dot-prop` заменён на propSet; правило фласок APT
// («#% increased Charge Recovery» без «#% increased effect») убрано — таких статов в данных PoE2 нет; фильтр без
// trade id (нет id для этого типа мода) в запрос не идёт.

import type { Poe2Data } from '../../data/Poe2Data'
import { type ParsedItem, ItemCategory, ItemRarity, ModifierType } from '../../parser'
import { stat } from '../../parser/statRef'
import {
  type ItemFilters,
  type StatFilter,
  INTERNAL_TRADE_IDS,
  type InternalTradeId,
  ItemIsElementalModifier,
  FilterTag,
  type ListingType
} from '../filters/interfaces'
import { areaLevelByAscendancyPoints } from '../filters/create-item-filters'
import { propSet } from './common'

export const CATEGORY_TO_TRADE_ID = new Map([
  [ItemCategory.Map, 'map'],
  [ItemCategory.AbyssJewel, 'jewel.abyss'],
  [ItemCategory.Amulet, 'accessory.amulet'],
  [ItemCategory.Belt, 'accessory.belt'],
  [ItemCategory.BodyArmour, 'armour.chest'],
  [ItemCategory.Boots, 'armour.boots'],
  [ItemCategory.Bow, 'weapon.bow'],
  [ItemCategory.Claw, 'weapon.claw'],
  [ItemCategory.Dagger, 'weapon.dagger'],
  [ItemCategory.FishingRod, 'weapon.rod'],
  [ItemCategory.Flask, 'flask'],
  [ItemCategory.Gloves, 'armour.gloves'],
  [ItemCategory.Helmet, 'armour.helmet'],
  [ItemCategory.Jewel, 'jewel'],
  [ItemCategory.OneHandedAxe, 'weapon.oneaxe'],
  [ItemCategory.OneHandedMace, 'weapon.onemace'],
  [ItemCategory.OneHandedSword, 'weapon.onesword'],
  [ItemCategory.Quiver, 'armour.quiver'],
  [ItemCategory.Ring, 'accessory.ring'],
  [ItemCategory.RuneDagger, 'weapon.runedagger'],
  [ItemCategory.Sceptre, 'weapon.sceptre'],
  [ItemCategory.Shield, 'armour.shield'],
  [ItemCategory.Staff, 'weapon.staff'],
  [ItemCategory.TwoHandedAxe, 'weapon.twoaxe'],
  [ItemCategory.TwoHandedMace, 'weapon.twomace'],
  [ItemCategory.TwoHandedSword, 'weapon.twosword'],
  [ItemCategory.Wand, 'weapon.wand'],
  [ItemCategory.Warstaff, 'weapon.warstaff'],
  [ItemCategory.ClusterJewel, 'jewel.cluster'],
  [ItemCategory.HeistBlueprint, 'heistmission.blueprint'],
  [ItemCategory.HeistContract, 'heistmission.contract'],
  [ItemCategory.HeistTool, 'heistequipment.heisttool'],
  [ItemCategory.HeistBrooch, 'heistequipment.heistreward'],
  [ItemCategory.HeistGear, 'heistequipment.heistweapon'],
  [ItemCategory.HeistCloak, 'heistequipment.heistutility'],
  [ItemCategory.Trinket, 'accessory.trinket'],
  [ItemCategory.SanctumRelic, 'sanctum.relic'],
  [ItemCategory.Tincture, 'tincture'],
  [ItemCategory.Charm, 'flask.charm'],
  [ItemCategory.Crossbow, 'weapon.crossbow'],
  [ItemCategory.SkillGem, 'gem.activegem'],
  [ItemCategory.SupportGem, 'gem.supportgem'],
  [ItemCategory.MetaGem, 'gem.metagem'],
  [ItemCategory.Focus, 'armour.focus'],
  [ItemCategory.Spear, 'weapon.spear'],
  [ItemCategory.Flail, 'weapon.flail'],
  [ItemCategory.Buckler, 'armour.buckler'],
  [ItemCategory.Tablet, 'map.tablet'],
  [ItemCategory.MapFragment, 'map.fragment'],
  [ItemCategory.Talisman, 'weapon.talisman'],
  [ItemCategory.Waystone, 'map.waystone']
])

const TOTAL_MODS_TEXT = {
  EMPTY_MODIFIERS: [stat('# Empty Modifiers'), stat('# Empty Prefix Modifiers'), stat('# Empty Suffix Modifiers')]
}

const ADDED_ELEMENTAL_DAMAGE = {
  FIRE: stat('Adds # to # Fire Damage'),
  COLD: stat('Adds # to # Cold Damage'),
  LIGHTNING: stat('Adds # to # Lightning Damage')
}

interface FilterBoolean {
  option?: 'true' | 'false'
}
interface FilterRange {
  min?: number
  max?: number
}

interface TradeStatQuery {
  id: string
  value?: {
    min?: number
    max?: number
    option?: number | string
  }
  disabled?: boolean
}

interface TradeStatGroup {
  type: 'and' | 'if' | 'count' | 'not'
  value?: FilterRange
  filters: TradeStatQuery[]
  disabled?: boolean
}

export interface TradeRequest {
  query: {
    status: { option: ListingType }
    name?: string | { discriminator: string; option: string }
    type?: string | { discriminator: string; option: string }
    stats: TradeStatGroup[]
    filters: {
      type_filters?: {
        filters: {
          rarity?: {
            option?: string
          }
          category?: {
            option?: string
          }
          ilvl?: FilterRange
          quality?: FilterRange
        }
      }
      equipment_filters?: {
        filters: {
          // Attacks per Second
          aps?: FilterRange
          // Armor Rating
          ar?: FilterRange
          // Block
          block?: FilterRange
          // Critical Strike Chance
          crit?: FilterRange
          // Damage per Second
          dps?: FilterRange
          // Elemental Damage per Second
          edps?: FilterRange
          // Energy Shield
          es?: FilterRange
          // Evasion Rating
          ev?: FilterRange
          // Physical Damage per Second
          pdps?: FilterRange
          // Augment Slots (still called rune on trade site)
          rune_sockets?: FilterRange
          // Spirit
          spirit?: FilterRange
          // reload time
          reload_time?: FilterRange
          // Runic Ward
          ward?: FilterRange
        }
      }
      req_filters?: {
        filters: {
          dex?: FilterRange
          int?: FilterRange
          lvl?: FilterRange
          str?: FilterRange
        }
      }
      map_filters?: {
        filters: {
          map_tier?: FilterRange
          map_revives?: FilterRange
          map_packsize?: FilterRange
          map_magic_monsters?: FilterRange
          map_rare_monsters?: FilterRange
          map_bonus?: FilterRange
          map_iir?: FilterRange
          map_gold?: FilterRange
          ultimatum_hint?: {
            option?: 'Victorious' | 'Cowardly' | 'Deadly'
          }
        }
      }
      misc_filters?: {
        filters: {
          alternate_art?: FilterBoolean
          area_level?: FilterRange
          corrupted?: FilterBoolean
          gem_level?: FilterRange
          gem_sockets?: FilterRange
          identified?: FilterBoolean
          mirrored?: FilterBoolean
          sanctified?: FilterBoolean
          sanctum_gold?: FilterRange
          unidentified_tier?: FilterRange
          veiled?: FilterBoolean
          fractured_item?: FilterBoolean
        }
      }
      trade_filters?: {
        filters: {
          collapse?: FilterBoolean
          indexed?: { option?: string }
          price?: FilterRange | { option?: string }
        }
      }
    }
  }
  sort: {
    price: 'asc'
  }
}

/** Статус поиска trade2: `onlineleague` бывает только у обмена — EE2 в этом случае ищет `securable`. */
export function tradeStatus(listingType: ItemFilters['trade']['listingType']): ListingType {
  return listingType === 'onlineleague' ? 'securable' : listingType
}

/** Тело запроса POST /api/trade2/search/<league>. Только английские имена и trade id → одинаково для EN и RU. */
export function createTradeRequest(filters: ItemFilters, stats: StatFilter[], item: ParsedItem, d: Poe2Data): TradeRequest {
  const body: TradeRequest = {
    query: {
      status: {
        option: tradeStatus(filters.trade.listingType)
      },
      stats: [{ type: 'and', filters: [] }],
      filters: {}
    },
    sort: {
      price: 'asc'
    }
  }
  const { query } = body
  const qf = query.filters as Record<string, unknown>

  if (filters.trade.currency) {
    propSet(qf, 'trade_filters.filters.price.option', filters.trade.currency)
  }

  if (filters.trade.collapseListings === 'api') {
    propSet(qf, 'trade_filters.filters.collapse.option', String(true))
  }

  if (filters.trade.listed) {
    propSet(qf, 'trade_filters.filters.indexed.option', filters.trade.listed)
  }

  // Search by category not base type?
  const activeSearch =
    filters.searchRelaxed && !filters.searchRelaxed.disabled ? filters.searchRelaxed : filters.searchExact

  if (activeSearch.nameTrade) {
    query.name = nameToQuery(activeSearch.nameTrade, filters)
  } else if (activeSearch.name) {
    query.name = nameToQuery(activeSearch.name, filters)
  }

  if (activeSearch.baseTypeTrade) {
    query.type = nameToQuery(activeSearch.baseTypeTrade, filters)
  } else if (activeSearch.baseType) {
    query.type = nameToQuery(activeSearch.baseType, filters)
  }

  // TYPE FILTERS
  if (activeSearch.category) {
    const id = CATEGORY_TO_TRADE_ID.get(activeSearch.category)
    if (id) {
      propSet(qf, 'type_filters.filters.category.option', id)
    } else {
      throw new Error(`Invalid category: ${activeSearch.category}`)
    }
  }

  if (filters.foil && !filters.foil.disabled) {
    propSet(qf, 'type_filters.filters.rarity.option', 'uniquefoil')
  } else if (filters.rarity) {
    propSet(qf, 'type_filters.filters.rarity.option', filters.rarity.value)
  }

  if (filters.itemLevel && !filters.itemLevel.disabled) {
    propSet(qf, 'type_filters.filters.ilvl.min', filters.itemLevel.value)
    if (filters.itemLevel.max) {
      propSet(qf, 'type_filters.filters.ilvl.max', filters.itemLevel.max)
    }
  }

  if (filters.requires && filters.requires.level && !filters.requires.level.disabled) {
    propSet(qf, 'req_filters.filters.lvl.max', filters.requires.level.value)
  }

  if (filters.quality && !filters.quality.disabled) {
    propSet(qf, 'type_filters.filters.quality.min', filters.quality.value)
  }

  // EQUIPMENT FILTERS

  if (filters.augmentSockets && !filters.augmentSockets.disabled) {
    propSet(qf, 'equipment_filters.filters.rune_sockets.min', filters.augmentSockets.value)
  }

  // MAP (WAYSTONE) FILTERS

  if (filters.mapTier && !filters.mapTier.disabled) {
    propSet(qf, 'map_filters.filters.map_tier.min', filters.mapTier.value)
    propSet(qf, 'map_filters.filters.map_tier.max', filters.mapTier.value)
  }

  if (filters.ultimatumHint && !filters.ultimatumHint.disabled) {
    propSet(qf, 'map_filters.filters.ultimatum_hint.option', filters.ultimatumHint.value)
  }

  // MISC FILTERS
  if (filters.gemLevel && !filters.gemLevel.disabled) {
    propSet(qf, 'misc_filters.filters.gem_level.min', filters.gemLevel.value)
    if (filters.gemLevel.max) {
      propSet(qf, 'misc_filters.filters.gem_level.max', filters.gemLevel.max)
    }
  }

  if (filters.socketNumber && !filters.socketNumber.disabled) {
    propSet(qf, 'misc_filters.filters.gem_sockets.min', filters.socketNumber.value)
  }

  if (filters.areaLevel && !filters.areaLevel.disabled) {
    if (filters.awardedAscendancyPoints) {
      // set max, lower has higher value, so exclude worse(higher area level) items
      propSet(qf, 'misc_filters.filters.area_level.max', filters.areaLevel.value)
    } else {
      propSet(qf, 'misc_filters.filters.area_level.min', filters.areaLevel.value)
    }
  }

  if (filters.awardedAscendancyPoints && !filters.awardedAscendancyPoints.disabled) {
    propSet(
      qf,
      'misc_filters.filters.area_level.min',
      areaLevelByAscendancyPoints(item.info.refName, filters.awardedAscendancyPoints.value)
    )
  }

  if (filters.unidentified && !filters.unidentified.disabled) {
    propSet(qf, 'misc_filters.filters.identified.option', String(false))
  }

  if (filters.unidentifiedTier && !filters.unidentifiedTier.disabled) {
    propSet(qf, 'misc_filters.filters.unidentified_tier.min', filters.unidentifiedTier.value)
  }

  if (
    (filters.corrupted?.value === false || filters.corrupted?.exact) &&
    filters.corrupted &&
    (!filters.sanctified || (filters.sanctified && filters.sanctified.disabled))
  ) {
    propSet(qf, 'misc_filters.filters.corrupted.option', String(filters.corrupted.value))
  }

  if (filters.fractured?.value === false) {
    propSet(qf, 'misc_filters.filters.fractured_item.option', String(false))
  }

  if (filters.mirrored) {
    if (filters.mirrored.disabled) {
      propSet(qf, 'misc_filters.filters.mirrored.option', String(false))
    }
  } else if (
    item.rarity === ItemRarity.Normal ||
    item.rarity === ItemRarity.Magic ||
    item.rarity === ItemRarity.Rare
  ) {
    propSet(qf, 'misc_filters.filters.mirrored.option', String(false))
  }

  if (filters.sanctified || (filters.corrupted?.value === true && !filters.corrupted?.exact)) {
    if (filters.sanctified?.disabled) {
      propSet(qf, 'misc_filters.filters.sanctified.option', String(false))
    }
  } else if (
    item.rarity === ItemRarity.Normal ||
    item.rarity === ItemRarity.Magic ||
    item.rarity === ItemRarity.Rare
  ) {
    propSet(qf, 'misc_filters.filters.sanctified.option', String(false))
  }

  // Meta internal stuff, crafting as empty and setting dps/pdps/edps
  for (const stat of stats) {
    if (stat.tradeId[0] === 'item.has_empty_modifier') {
      const TARGET_ID = {
        EMPTY_MODIFIERS: d.statByRef(TOTAL_MODS_TEXT.EMPTY_MODIFIERS[stat.option!.value])!.trade.ids[
          ModifierType.Pseudo
        ][0]
      }
      const emptyRoll = stat.roll!
      query.stats.push({
        type: 'count',
        value: { min: 1, max: 1 },
        disabled: stat.disabled,
        filters: [
          {
            id: TARGET_ID.EMPTY_MODIFIERS,
            value: { ...getMinMax(emptyRoll) },
            disabled: stat.disabled
          }
        ]
      })
    }

    if (stat.disabled) continue

    const applyElementalDamageLogicalFilter = () => {
      const mapIds = (ids: { [type: string]: string[] }) =>
        Object.values(ids)
          .flat()
          .map((id) => ({ id }))
      const fireIds = mapIds(d.statByRef(ADDED_ELEMENTAL_DAMAGE.FIRE)!.trade.ids)
      const coldIds = mapIds(d.statByRef(ADDED_ELEMENTAL_DAMAGE.COLD)!.trade.ids)
      const lightningIds = mapIds(d.statByRef(ADDED_ELEMENTAL_DAMAGE.LIGHTNING)!.trade.ids)

      const selectedType = stat.option!.value as ItemIsElementalModifier
      const notGroup: Array<{ id: string }> = []
      switch (selectedType) {
        case ItemIsElementalModifier.Any:
          break
        case ItemIsElementalModifier.Fire:
          notGroup.push(...coldIds)
          notGroup.push(...lightningIds)
          break
        case ItemIsElementalModifier.Cold:
          notGroup.push(...fireIds)
          notGroup.push(...lightningIds)
          break
        case ItemIsElementalModifier.Lightning:
          notGroup.push(...fireIds)
          notGroup.push(...coldIds)
          break
      }
      if (notGroup.length) {
        query.stats.push({
          type: 'not',
          filters: notGroup
        })
      }
    }

    const input = stat.roll!
    const range = (path: string) => {
      propSet(qf, `${path}.min`, typeof input.min === 'number' ? input.min : undefined)
      propSet(qf, `${path}.max`, typeof input.max === 'number' ? input.max : undefined)
    }
    // FIXME (EE2): should also 100% include *.max here
    const rangeMin = (path: string) => {
      propSet(qf, `${path}.min`, typeof input.min === 'number' ? input.min : undefined)
    }
    switch (stat.tradeId[0] as InternalTradeId) {
      case 'item.armour':
        range('equipment_filters.filters.ar')
        break
      case 'item.evasion_rating':
        range('equipment_filters.filters.ev')
        break
      case 'item.energy_shield':
        range('equipment_filters.filters.es')
        break
      case 'item.runic_ward':
        range('equipment_filters.filters.ward')
        break
      case 'item.block':
        range('equipment_filters.filters.block')
        break
      case 'item.total_dps':
        range('equipment_filters.filters.dps')
        break
      case 'item.physical_dps':
        range('equipment_filters.filters.pdps')
        break
      case 'item.elemental_dps':
        range('equipment_filters.filters.edps')
        applyElementalDamageLogicalFilter()
        break
      case 'item.crit':
        range('equipment_filters.filters.crit')
        break
      case 'item.aps':
        range('equipment_filters.filters.aps')
        break
      case 'item.spirit':
        range('equipment_filters.filters.spirit')
        break
      case 'item.reload_time':
        range('equipment_filters.filters.reload_time')
        break
      case 'item.rarity_magic':
        propSet(qf, 'type_filters.filters.rarity.option', 'magic')
        break
      case 'item.map_revives':
        rangeMin('map_filters.filters.map_revives')
        break
      case 'item.map_pack_size':
        rangeMin('map_filters.filters.map_packsize')
        break
      case 'item.map_magic_monsters':
        rangeMin('map_filters.filters.map_magic_monsters')
        break
      case 'item.map_rare_monsters':
        rangeMin('map_filters.filters.map_rare_monsters')
        break
      case 'item.map_drop_chance':
        rangeMin('map_filters.filters.map_bonus')
        break
      case 'item.map_item_rarity':
        rangeMin('map_filters.filters.map_iir')
        break
      case 'item.map_gold':
        rangeMin('map_filters.filters.map_gold')
        break
      case 'item.duplicates': {
        if (item.info.refName !== 'Mageblood') {
          throw new Error('Duplicates filter applied to non-mageblood')
        }
        // make a NOT and put all legacies in there
        // then disable ones found on this item
        const bmFilter = buildMageBloodNotFilter(
          stat,
          stats.filter((s) => s.statRef.startsWith('Legacy of')),
          query.stats[0]
        )
        if (bmFilter) {
          query.stats.push(bmFilter)
        }
        break
      }
    }
  }

  stats = stats.filter((stat) => !INTERNAL_TRADE_IDS.includes(stat.tradeId[0]))

  const qAnd = query.stats[0]
  for (const stat of stats) {
    // POETH: у стата нет trade id для этого типа мода — искать нечем
    if (!stat.tradeId.length) continue

    if (stat.statRef === 'Only affects Passives in # Ring') {
      const metaSource = stat.roll!
      const metamorphosisCount = metaSource.bounds!.max
      const metamorphosisCurrent = metaSource.min as number
      const builtTradeFilter = Array.from({ length: metamorphosisCount }, (_, index) => ({
        id: `${stat.tradeId[0]}|${index + 1}`,
        disabled: index + 1 !== metamorphosisCurrent
      }))
      query.stats.push({
        type: 'count',
        value: { min: 1 },
        disabled: stat.disabled,
        filters: builtTradeFilter
      })
      continue
    }

    if (stat.tradeId.length === 1) {
      qAnd.filters.push(tradeIdToQuery(stat.tradeId[0], stat))
    } else {
      query.stats.push({
        type: 'count',
        value: { min: 1 },
        disabled: stat.disabled,
        filters: stat.tradeId.map((id) => tradeIdToQuery(id, stat))
      })
    }
  }

  if (filters.veiled && !filters.veiled.disabled) {
    propSet(qf, 'misc_filters.filters.veiled.option', String(true))
    const veiledCount = filters.veiled.veiledCount

    // HACK: add pseudo stat for veiled count(dont want on my ui though)
    qAnd.filters.push(
      tradeIdToQuery('pseudo.pseudo_number_of_unrevealed_mods', {
        tradeId: ['pseudo.pseudo_number_of_unrevealed_mods'],
        statRef: '# Unrevealed Modifiers',
        text: 'Unrevealed Modifiers',
        tag: FilterTag.Pseudo,
        sources: [],
        roll: {
          value: veiledCount,
          min: veiledCount,
          max: undefined,
          default: { min: veiledCount, max: veiledCount },
          dp: false,
          isNegated: false
        },
        disabled: false
      })
    )
  }

  return body
}

function getMinMax(roll: StatFilter['roll']) {
  if (!roll) {
    return { min: undefined, max: undefined }
  }

  const sign = roll.tradeInvert ? -1 : 1
  const a = typeof roll.min === 'number' ? roll.min * sign : undefined
  const b = typeof roll.max === 'number' ? roll.max * sign : undefined

  return !roll.tradeInvert ? { min: a, max: b } : { min: b, max: a }
}

function tradeIdToQuery(id: string, stat: StatFilter): TradeStatQuery {
  // NOTE: if there will be too many overrides in the future,
  //       consider moving them to stats.ndjson
  const roll = stat.roll
  let tradeId = id
  if (stat.option != null) {
    tradeId += `|${stat.option.value}`
  }

  return {
    id: tradeId,
    value: {
      ...getMinMax(roll)
    },
    disabled: stat.disabled
  }
}

function nameToQuery(name: string, filters: ItemFilters) {
  if (!filters.discriminator) {
    return name
  } else {
    return {
      discriminator: filters.discriminator.trade,
      option: name
    }
  }
}

const EASY_LEGACY_DUPLICATE_TO_FILTER = new Map<
  number,
  {
    count: number
    values: Array<{
      min?: number
      max?: number
      option?: number | string
    }>
  }
>([
  [3, { count: 1, values: [{ min: 4 }] }],
  [2, { count: 4, values: [{ min: 1 }, { min: 2 }, { min: 3 }] }],
  [1, { count: 7, values: [{ min: 1 }, { min: 2 }, { max: 2 }] }]
])

function buildFilterWithValue(
  inFilter: StatFilter,
  inRoll:
    | {
        value: number
        min: number | undefined
        max: number | undefined
      }
    | undefined
) {
  if (!inRoll) {
    return tradeIdToQuery(inFilter.tradeId[0], inFilter)
  }
  const newFilter: StatFilter = {
    ...inFilter,
    roll: {
      ...inRoll,
      dp: false,
      isNegated: false,
      default: { min: inRoll.value, max: inRoll.value }
    }
  }
  return tradeIdToQuery(newFilter.tradeId[0], newFilter)
}

/** Mageblood: «дубликаты» Legacy of # — count-группа по известным и возможным наследиям. */
function buildMageBloodNotFilter(
  duplicateStat: StatFilter,
  legacyOfStats: StatFilter[],
  qAnd: TradeStatGroup
): TradeStatGroup | undefined {
  const countFilter: TradeStatGroup = {
    type: 'count',
    filters: []
  }

  const knownCount = legacyOfStats.filter((s) => !s.disabled).length
  const dupCount = (duplicateStat.roll!.min as number) ?? duplicateStat.roll!.value
  if (dupCount + knownCount > 4) {
    throw new Error('not valid Mageblood, reduce duplicates or unselect a Legacy')
  }

  if (duplicateStat.disabled) {
    // dont do anything and return after adding to main filters,
    // no duplicate calcs since disabled
    qAnd.filters.push(...legacyOfStats.map((s) => buildFilterWithValue(s, undefined)))
    return
  }

  // KNOWN 1-4, DUP 0
  if (dupCount === 0) {
    // dont do any min stuff
    qAnd.filters.push(...legacyOfStats.map((s) => buildFilterWithValue(s, undefined)))
    return
  }

  // KNOWN 4 DUP 0, KNOWN 3 DUP 1, KNOWN 2 DUP 2, KNOWN 1 DUP 3
  if (knownCount + dupCount === 4) {
    // "easy cases"
    // KNOWN 1 DUP 3
    if (dupCount === 3) {
      qAnd.filters.push(...legacyOfStats.map((s) => buildFilterWithValue(s, { value: 4, min: 4, max: undefined })))
      return
    }

    // slightly harder cases
    // KNOWN 2 DUP 2 or KNOWN 3 DUP 1
    if (dupCount === 2 || dupCount === 1) {
      qAnd.filters.push(...legacyOfStats.map((s) => buildFilterWithValue(s, undefined)))
      const dupFilter = EASY_LEGACY_DUPLICATE_TO_FILTER.get(dupCount)!
      countFilter.value = {
        min: dupFilter.count
      }

      countFilter.filters.push(
        ...legacyOfStats
          .map((s) => buildFilterWithValue(s, undefined))
          .flatMap((legFilter) => {
            return dupFilter.values.map((v) => ({
              ...legFilter,
              value: { ...v }
            }))
          })
      )

      return countFilter
    }
  }
  // yuk, "hard cases", will be on edge of complexity possibly
  // KNOWN 1 DUP 1, KNOWN 2 DUP 1, KNOWN 1 DUP 2

  // add existing
  qAnd.filters.push(...legacyOfStats.map((s) => buildFilterWithValue(s, undefined)))

  // precursor data
  const someLegacy = legacyOfStats[0]
  const tradeId = someLegacy.tradeId[0].split('|')[0]
  const legacyTradeIds = someLegacy.sources[0].stat.stat.matchers.map((m) => `${tradeId}|${m.value}`)

  countFilter.value = {
    min: 1
  }
  if (dupCount === 1) {
    countFilter.filters.push(
      ...legacyTradeIds.map((id) => ({
        id,
        value: { min: 2 }
      }))
    )
    return countFilter
  }
  if (dupCount === 2) {
    countFilter.filters.push(
      ...legacyTradeIds.map((id) => ({
        id,
        value: { min: 1 }
      }))
    )
  }

  return countFilter
}
