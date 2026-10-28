// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/interfaces.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: статус листингов — одно поле `trade.status` (available / securable / online / any) вместо
// offline + merchantOnly; группа `timeless` (count по сиду) и сведения о timeless в пресете; без полей
// mercenary/heist (отложены).

import type { ItemInfluence, ItemCategory } from '../../parser'
import { ModifierType, ModifierMechanic, type StatCalculated } from '../../parser/modifiers'
import type { TimelessSearch } from './pseudo/timeless-jewel'
import type { DefaultsHint } from './defaults'

/**
 * Статус листингов на трейде:
 *  - `available` — купить сразу: мерчант-листинги (instant buyout) + продавцы в игре (по умолчанию);
 *  - `securable` — только мерчант-листинги (покупка на сайте, комиссия в золоте, без whisper);
 *  - `online` — только продавцы в игре (классический трейд через whisper);
 *  - `any` — все, включая офлайн.
 */
export type TradeStatus = 'available' | 'securable' | 'online' | 'any'
export const TRADE_STATUSES: readonly TradeStatus[] = ['available', 'securable', 'online', 'any']

export interface FilterPreset {
  /** i18n-ключ: filters.preset_pseudo / preset_exact / preset_base_item / preset_bulk */
  id: string
  filters: ItemFilters
  stats: FilterOrGroup[]
  /** POETH: timeless-джуэл — режим завоевателя, ссылка в калькулятор */
  timeless?: TimelessSearch
  /** POETH: почему отмечены именно эти фильтры (ключ подсказки pc1.defaults.*) */
  defaultsHint?: DefaultsHint
}

interface SearchFilter {
  /** локализованное имя (для показа) */
  name?: string
  /** английское имя — в запрос */
  nameTrade?: string
  baseType?: string
  baseTypeTrade?: string
  discriminatorTrade?: string
  category?: ItemCategory
}

interface SearchFilterSub extends SearchFilter {
  sub?: SearchFilter & { disabled: boolean }
}

export interface ItemFilters {
  searchExact: SearchFilterSub
  searchRelaxed?: SearchFilterSub & { disabled: boolean }
  rarity?: {
    value: string
    disabled: boolean
  }
  linkedSockets?: FilterNumeric
  whiteSockets?: FilterNumeric
  corrupted?: {
    value: boolean
    exact?: boolean
  }
  fractured?: {
    value: false
  }
  imbuedGem?: {
    disabled: true
  }
  mirrored?: {
    disabled: boolean
    hidden: boolean
  }
  split?: {
    disabled: boolean
    hidden: boolean
  }
  foil?: {
    disabled: boolean
  }
  foulborn?: {
    value: boolean
  }
  vestigial?: {
    value: boolean
  }
  influences?: Array<{
    value: ItemInfluence
    disabled: boolean
  }>
  quality?: FilterNumeric
  gemLevel?: FilterNumeric
  mapTier?: FilterNumeric
  mapBlighted?: {
    value: 'Blighted' | 'Blight-ravaged' | false
  }
  mapCompletionReward?: {
    name: string
    nameTrade: string
  }
  itemLevel?: FilterNumeric
  stackSize?: FilterNumeric
  unidentified?: {
    value: true
    disabled: boolean
  }
  veiled?: {
    statRefs: string[]
    disabled: boolean
  }
  areaLevel?: FilterNumeric
  sentinelCharge?: FilterNumeric
  trade: {
    status: TradeStatus
    /** bulk-обмен: только продавцы в этой лиге (`onlineleague`) */
    onlineInLeague: boolean
    listed: string | null
    currency: string | null
    league: string
    collapseListings: 'api' | 'app'
    collapseMerchant: boolean
  }
}

export interface FilterNumeric {
  value: number
  max?: number | undefined
  disabled: boolean
}

export type FilterOrGroup = StatFilter | FilterGroup

export interface FilterGroup {
  /** `one` — count ≥ 1 из списка (напр. сид timeless у любого из завоевателей) */
  group: 'not' | 'one'
  expanded: boolean // NOTE: mutable in UI
  meta: StatFilter
  stats: StatFilter[]
  /** POETH: группа сида timeless-джуэла (UI показывает чипы «любой / точный завоеватель») */
  kind?: 'timeless'
}

export interface StatFilter {
  group?: never
  tradeId: string[]
  /** английский шаблон стата — одинаков для EN и RU */
  statRef: string
  /** текст на языке предмета (для показа) */
  text: string
  tag: FilterTag
  oils?: string[]
  sources: StatCalculated['sources']
  not?: true
  roll?: {
    value: number
    min: number | '' | undefined // NOTE: mutable in UI
    max: number | '' | undefined // NOTE: mutable in UI
    default: { min: number; max: number }
    bounds?: { min: number; max: number }
    tradeInvert?: boolean
    dp: boolean
    isNegated: boolean
    /** 0…1 — насколько хорош ролл внутри диапазона тира (1 — максимум) */
    goodness?: number
  }
  option?: {
    value: number // NOTE: mutable in UI
  }
  /** POETH: стат найден только в данных сайта трейда (мод нового патча, нет в данных APT) */
  fromSite?: true
  /** i18n-ключ причины, почему фильтр скрыт по умолчанию */
  hidden?: string
  disabled: boolean // NOTE: mutable in UI
}

const _INTERNAL_TRADE_IDS = [
  'item.not_group',
  'item.count_one_group',
  'item.base_percentile',
  'item.memory_strands',
  'item.armour',
  'item.evasion_rating',
  'item.energy_shield',
  'item.ward',
  'item.block',
  'item.total_dps',
  'item.physical_dps',
  'item.elemental_dps',
  'item.crit',
  'item.aps',
  'item.has_empty_modifier',
  'item.map_item_quantity',
  'item.map_item_rarity',
  'item.map_pack_size',
  'item.chart_sulphur'
] as const

export type InternalTradeId = (typeof _INTERNAL_TRADE_IDS)[number]
export const INTERNAL_TRADE_IDS = _INTERNAL_TRADE_IDS as readonly string[]

export enum ItemHasEmptyModifier {
  Any = 0,
  Prefix = 1,
  Suffix = 2
}

enum FilterTagExtra {
  Variant = 'variant',
  Property = 'property',
  Brick = 'brick',
  FilterGroup = 'filter-group'
}

export type FilterTag = ModifierType | ModifierMechanic | FilterTagExtra

export const FilterTag = {
  ...ModifierType,
  ...ModifierMechanic,
  ...FilterTagExtra
}
