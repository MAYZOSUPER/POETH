// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/web/price-check/trade/pathofexile-trade.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: только чистая часть до сети — тело POST /api/trade/search/<league> (сеть, лимиты, кэш —
// main/S3); статус из `filters.trade.status`; данные языка параметром (id псевдо-статов от языка не зависят);
// группы наёмников и Heist-фильтры отложены; `dot-prop` заменён на propSet.

import type { Poe1Data } from '../../data/Poe1Data'
import { ItemInfluence, ItemCategory } from '../../parser'
import { ModifierType } from '../../parser/modifiers'
import { stat } from '../../parser/statRef'
import {
  type ItemFilters,
  type StatFilter,
  type FilterOrGroup,
  INTERNAL_TRADE_IDS,
  type InternalTradeId,
  type TradeStatus
} from '../filters/interfaces'
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
  [ItemCategory.Charm, 'azmeri.charm'],
  [ItemCategory.Idol, 'idol'],
  [ItemCategory.Graft, 'graft'],
  [ItemCategory.Chart, 'chart']
])

const TOTAL_MODS_TEXT = {
  CRAFTED_MODIFIERS: [stat('# Crafted Modifiers'), stat('# Crafted Prefix Modifiers'), stat('# Crafted Suffix Modifiers')],
  EMPTY_MODIFIERS: [stat('# Empty Modifiers'), stat('# Empty Prefix Modifiers'), stat('# Empty Suffix Modifiers')],
  TOTAL_MODIFIERS: [stat('# Modifiers'), stat('# Prefix Modifiers'), stat('# Suffix Modifiers')]
}

const INFLUENCE_PSEUDO_TEXT = {
  [ItemInfluence.Shaper]: stat('Has Shaper Influence'),
  [ItemInfluence.Crusader]: stat('Has Crusader Influence'),
  [ItemInfluence.Hunter]: stat('Has Hunter Influence'),
  [ItemInfluence.Elder]: stat('Has Elder Influence'),
  [ItemInfluence.Redeemer]: stat('Has Redeemer Influence'),
  [ItemInfluence.Warlord]: stat('Has Warlord Influence')
}

interface FilterBoolean {
  option?: 'true' | 'false'
}
interface FilterRange {
  min?: number
  max?: number
}

export interface TradeRequest {
  query: {
    status: { option: TradeStatus }
    name?: string | { discriminator: string; option: string }
    type?: string | { discriminator: string; option: string }
    stats: Array<{
      type: 'and' | 'if' | 'count' | 'not'
      value?: FilterRange
      filters: Array<{
        id: string
        value?: {
          min?: number
          max?: number
          option?: number | string
        }
        disabled?: boolean
      }>
      disabled?: boolean
    }>
    filters: {
      type_filters?: { filters: { rarity?: { option?: string }; category?: { option?: string } } }
      socket_filters?: { filters: { links?: FilterRange; sockets?: { w?: number } } }
      misc_filters?: { filters: Record<string, FilterRange | FilterBoolean> }
      armour_filters?: { filters: Record<string, FilterRange> }
      weapon_filters?: { filters: Record<string, FilterRange> }
      map_filters?: { filters: Record<string, FilterRange | FilterBoolean | { option?: string }> }
      sentinel_filters?: { filters: { sentinel_durability?: FilterRange } }
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

type TradeStatGroup = TradeRequest['query']['stats'][number]

/** Тело запроса POST /api/trade/search/<league>. Только английские имена и trade id → одинаково для EN и RU. */
export function createTradeRequest(filters: ItemFilters, stats: FilterOrGroup[], d: Poe1Data): TradeRequest {
  const body: TradeRequest = {
    query: {
      status: { option: filters.trade.status },
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

  if (
    filters.trade.collapseListings === 'api' &&
    (filters.trade.status !== 'securable' || filters.trade.collapseMerchant)
  ) {
    propSet(qf, 'trade_filters.filters.collapse.option', String(true))
  }

  if (filters.trade.listed) {
    propSet(qf, 'trade_filters.filters.indexed.option', filters.trade.listed)
  }

  let activeSearch =
    filters.searchRelaxed && !filters.searchRelaxed.disabled ? filters.searchRelaxed : filters.searchExact
  if (activeSearch.sub && !activeSearch.sub.disabled) {
    activeSearch = activeSearch.sub
  }

  if (activeSearch.nameTrade) {
    query.name = nameToQuery(activeSearch.nameTrade, activeSearch.discriminatorTrade)
  } else if (activeSearch.name) {
    query.name = nameToQuery(activeSearch.name, activeSearch.discriminatorTrade)
  }

  if (activeSearch.baseTypeTrade) {
    query.type = nameToQuery(activeSearch.baseTypeTrade, activeSearch.discriminatorTrade)
  } else if (activeSearch.baseType) {
    query.type = nameToQuery(activeSearch.baseType, activeSearch.discriminatorTrade)
  }

  if (filters.foil && !filters.foil.disabled) {
    propSet(qf, 'type_filters.filters.rarity.option', 'uniquefoil')
  } else if (filters.rarity) {
    propSet(qf, 'type_filters.filters.rarity.option', filters.rarity.disabled ? 'nonunique' : filters.rarity.value)
  }

  if (activeSearch.category) {
    const id = CATEGORY_TO_TRADE_ID.get(activeSearch.category)
    if (id) {
      propSet(qf, 'type_filters.filters.category.option', id)
    } else {
      throw new Error(`Invalid category: ${activeSearch.category}`)
    }
  }

  if (filters.corrupted?.value === false || filters.corrupted?.exact) {
    propSet(qf, 'misc_filters.filters.corrupted.option', String(filters.corrupted.value))
  }
  if (filters.fractured?.value === false) {
    propSet(qf, 'misc_filters.filters.fractured_item.option', String(false))
  }
  if (filters.imbuedGem?.disabled) {
    propSet(qf, 'misc_filters.filters.gem_imbued.option', String(false))
  }
  if (filters.split?.disabled) {
    propSet(qf, 'misc_filters.filters.split.option', String(false))
  }
  if (filters.foulborn?.value === false) {
    propSet(qf, 'misc_filters.filters.foulborn_item.option', String(false))
  }
  if (filters.vestigial?.value === false) {
    propSet(qf, 'misc_filters.filters.vestigial.option', String(false))
  }
  if (filters.mirrored?.disabled) {
    propSet(qf, 'misc_filters.filters.mirrored.option', String(false))
  }

  if (filters.gemLevel && !filters.gemLevel.disabled) {
    propSet(qf, 'misc_filters.filters.gem_level.min', filters.gemLevel.value)
  }

  if (filters.quality && !filters.quality.disabled) {
    propSet(qf, 'misc_filters.filters.quality.min', filters.quality.value)
  }

  if (filters.itemLevel && !filters.itemLevel.disabled) {
    propSet(qf, 'misc_filters.filters.ilvl.min', filters.itemLevel.value)
    if (filters.itemLevel.max) {
      propSet(qf, 'misc_filters.filters.ilvl.max', filters.itemLevel.max)
    }
  }

  if (filters.stackSize && !filters.stackSize.disabled) {
    propSet(qf, 'misc_filters.filters.stack_size.min', filters.stackSize.value)
  }

  if (filters.linkedSockets && !filters.linkedSockets.disabled) {
    propSet(qf, 'socket_filters.filters.links.min', filters.linkedSockets.value)
  }

  if (filters.whiteSockets && !filters.whiteSockets.disabled) {
    propSet(qf, 'socket_filters.filters.sockets.w', filters.whiteSockets.value)
  }

  if (filters.mapTier && !filters.mapTier.disabled) {
    propSet(qf, 'map_filters.filters.map_tier.min', filters.mapTier.value)
    propSet(qf, 'map_filters.filters.map_tier.max', filters.mapTier.value)
  }

  if (filters.mapBlighted) {
    if (filters.mapBlighted.value === 'Blighted') {
      propSet(qf, 'map_filters.filters.map_blighted.option', String(true))
    } else if (filters.mapBlighted.value === 'Blight-ravaged') {
      propSet(qf, 'map_filters.filters.map_uberblighted.option', String(true))
    } else if (filters.mapBlighted.value === false) {
      propSet(qf, 'map_filters.filters.map_blighted.option', String(false))
      propSet(qf, 'map_filters.filters.map_uberblighted.option', String(false))
    }
  }

  if (filters.mapCompletionReward) {
    propSet(qf, 'map_filters.filters.map_completion_reward.option', filters.mapCompletionReward.nameTrade)
  }

  if (filters.unidentified && !filters.unidentified.disabled) {
    propSet(qf, 'misc_filters.filters.identified.option', String(false))
  }

  if (filters.areaLevel && !filters.areaLevel.disabled) {
    propSet(qf, 'map_filters.filters.area_level.min', filters.areaLevel.value)
    if (filters.areaLevel.max) {
      propSet(qf, 'map_filters.filters.area_level.max', filters.areaLevel.max)
    }
  }

  if (filters.sentinelCharge && !filters.sentinelCharge.disabled) {
    propSet(qf, 'sentinel_filters.filters.sentinel_durability.min', filters.sentinelCharge.value)
  }

  for (const stat of stats) {
    if (stat.group || !stat.tradeId[0].startsWith('item.')) continue

    if (stat.tradeId[0] === 'item.has_empty_modifier') {
      const pseudoId = (ref: string) => d.pseudoStatByRef(ref)!.trade.ids[ModifierType.Pseudo][0]
      const TARGET_ID = {
        CRAFTED_MODIFIERS: pseudoId(TOTAL_MODS_TEXT.CRAFTED_MODIFIERS[stat.option!.value]),
        EMPTY_MODIFIERS: pseudoId(TOTAL_MODS_TEXT.EMPTY_MODIFIERS[stat.option!.value]),
        TOTAL_MODIFIERS: pseudoId(TOTAL_MODS_TEXT.TOTAL_MODIFIERS[0])
      }

      query.stats.push({
        type: 'count',
        value: { min: 1, max: 1 },
        disabled: stat.disabled,
        filters: [
          { id: TARGET_ID.EMPTY_MODIFIERS, value: { min: 1, max: 1 }, disabled: stat.disabled },
          { id: TARGET_ID.CRAFTED_MODIFIERS, value: { min: 1, max: undefined }, disabled: stat.disabled }
        ]
      })

      query.stats.push({
        type: 'count',
        value: { min: 1, max: 1 },
        disabled: stat.disabled,
        filters: [
          { id: TARGET_ID.EMPTY_MODIFIERS, value: { min: 1, max: 1 }, disabled: stat.disabled },
          { id: TARGET_ID.TOTAL_MODIFIERS, value: { min: 6, max: undefined }, disabled: stat.disabled }
        ]
      })
    }

    if (stat.disabled) continue

    const input = stat.roll!
    const range = (path: string) => {
      propSet(qf, `${path}.min`, typeof input.min === 'number' ? input.min : undefined)
      propSet(qf, `${path}.max`, typeof input.max === 'number' ? input.max : undefined)
    }
    switch (stat.tradeId[0] as InternalTradeId) {
      case 'item.base_percentile':
        range('armour_filters.filters.base_defence_percentile')
        break
      case 'item.memory_strands':
        range('misc_filters.filters.memory_level')
        break
      case 'item.armour':
        range('armour_filters.filters.ar')
        break
      case 'item.evasion_rating':
        range('armour_filters.filters.ev')
        break
      case 'item.energy_shield':
        range('armour_filters.filters.es')
        break
      case 'item.ward':
        range('armour_filters.filters.ward')
        break
      case 'item.block':
        range('armour_filters.filters.block')
        break
      case 'item.total_dps':
        range('weapon_filters.filters.dps')
        break
      case 'item.physical_dps':
        range('weapon_filters.filters.pdps')
        break
      case 'item.elemental_dps':
        range('weapon_filters.filters.edps')
        break
      case 'item.crit':
        range('weapon_filters.filters.crit')
        break
      case 'item.aps':
        range('weapon_filters.filters.aps')
        break
      case 'item.map_item_quantity':
        range('map_filters.filters.map_iiq')
        break
      case 'item.map_item_rarity':
        range('map_filters.filters.map_iir')
        break
      case 'item.map_pack_size':
        range('map_filters.filters.map_packsize')
        break
      case 'item.chart_sulphur':
        range('map_filters.filters.chart_sulphur')
        break
    }
  }

  type NoUiStatFilter = Pick<StatFilter, 'not' | keyof BareStatFilter>
  const realStats: NoUiStatFilter[] = stats.filter(
    (stat): stat is StatFilter => !stat.group && !INTERNAL_TRADE_IDS.includes(stat.tradeId[0])
  )
  if (filters.veiled) {
    for (const statRef of filters.veiled.statRefs) {
      const statOrGroup = d.statByRefV2(statRef)!
      const dbStats = 'stats' in statOrGroup ? statOrGroup.stats : [statOrGroup]
      realStats.push({
        disabled: filters.veiled.disabled,
        tradeId: dbStats
          .filter((dbStat) => ModifierType.Veiled in dbStat.trade.ids)
          .map((dbStat) => dbStat.trade.ids[ModifierType.Veiled][0])
      })
    }
  }

  if (filters.influences) {
    for (const influence of filters.influences) {
      realStats.push({
        disabled: influence.disabled,
        tradeId: d.pseudoStatByRef(INFLUENCE_PSEUDO_TEXT[influence.value])!.trade.ids[ModifierType.Pseudo]
      })
    }
  }

  const qAnd = query.stats[0]
  const qNot: TradeStatGroup = {
    type: 'not',
    filters: []
  }

  for (const group of stats) {
    if (group.group === 'not') {
      query.stats.push({
        type: 'not',
        disabled: group.meta.disabled,
        filters: group.stats.flatMap((stat) => everyTradeIdToQuery(stat))
      })
    } else if (group.group === 'one') {
      query.stats.push({
        type: 'count',
        value: { min: 1 },
        disabled: group.meta.disabled || group.stats.every((stat) => stat.disabled),
        filters: group.stats.flatMap((stat) => everyTradeIdToQuery(stat))
      })
    }
  }

  for (const stat of realStats) {
    if (stat.not) {
      qNot.filters.push(...everyTradeIdToQuery(stat))
    } else {
      appendAndFilter(stat, qAnd, query.stats)
    }
  }

  if (qNot.filters.length) {
    query.stats.push(qNot)
  }

  return body
}

/**
 * POETH: имена предметов под язык хоста трейда. Проверено на живом API 28.10.2026: ru.pathofexile.com
 * отвечает `400 Unknown item name` на английские `name`/`type` — там нужны русские имена (trade id статов,
 * категории и дискриминаторы от языка не зависят). `target` — данные языка хоста (ru для ru.pathofexile.com).
 */
export function localizeTradeRequest(body: TradeRequest, target: Poe1Data): TradeRequest {
  if (target.lang === 'en') return body
  const translate = (ref: string, namespaces: ReadonlyArray<Parameters<Poe1Data['itemByRef']>[0]>): string => {
    for (const ns of namespaces) {
      const found = target.itemByRef(ns, ref)
      if (found) return found[0].name
    }
    return ref
  }
  type NameQuery = string | { discriminator: string; option: string }
  const map = (v: NameQuery, ns: Parameters<typeof translate>[1]): NameQuery =>
    typeof v === 'string' ? translate(v, ns) : { discriminator: v.discriminator, option: translate(v.option, ns) }
  const query = { ...body.query }
  if (query.name) query.name = map(query.name, ['UNIQUE'])
  if (query.type) query.type = map(query.type, ['ITEM', 'GEM', 'DIVINATION_CARD', 'CAPTURED_BEAST'])
  const reward = (query.filters.map_filters?.filters.map_completion_reward as { option?: string } | undefined)?.option
  if (reward) {
    query.filters = structuredClone(query.filters)
    ;(query.filters.map_filters!.filters.map_completion_reward as { option?: string }).option = translate(reward, ['UNIQUE'])
  }
  return { ...body, query }
}

function getMinMax(roll: StatFilter['roll'], divisor: number) {
  if (!roll) {
    return { min: undefined, max: undefined }
  }

  const sign = roll.tradeInvert ? -1 : 1
  const a = typeof roll.min === 'number' ? (roll.min * sign) / divisor : undefined
  const b = typeof roll.max === 'number' ? (roll.max * sign) / divisor : undefined

  return !roll.tradeInvert ? { min: a, max: b } : { min: b, max: a }
}

type BareStatFilter = Pick<StatFilter, 'roll' | 'option' | 'disabled' | 'tradeId'>

function appendAndFilter(stat: BareStatFilter, defaultAndGroup: TradeStatGroup, allGroups: TradeStatGroup[]): void {
  if (stat.tradeId.length === 1) {
    defaultAndGroup.filters.push(tradeIdToQuery(stat.tradeId[0], stat))
  } else {
    allGroups.push({
      type: 'count',
      value: { min: 1 },
      disabled: stat.disabled,
      filters: everyTradeIdToQuery(stat)
    })
  }
}

function everyTradeIdToQuery(stat: BareStatFilter) {
  return stat.tradeId.map((id) => tradeIdToQuery(id, stat))
}

function tradeIdToQuery(id: string, stat: BareStatFilter) {
  let roll = stat.roll
  const divMinMax = id.startsWith('{div_by_100}') ? 100 : 1
  if (id.startsWith('{empty}') || (id.startsWith('{empty_if_100}') && roll?.value === 100)) {
    roll = undefined
  }

  if (id.startsWith('{')) {
    id = id.slice(id.indexOf('}') + 1)
  }

  return {
    id,
    value: {
      ...getMinMax(roll, divMinMax),
      option: stat.option != null ? stat.option.value : undefined
    },
    disabled: stat.disabled
  }
}

function nameToQuery(name: string, discriminator?: string) {
  if (!discriminator) {
    return name
  } else {
    return {
      discriminator: discriminator,
      option: name
    }
  }
}
