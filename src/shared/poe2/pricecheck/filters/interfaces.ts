// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/interfaces.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: тип `ListingType` (статусы trade2) и список LISTING_TYPES; `trade.currency` / `trade.listed` —
// `string | null` (как у PoE1); поле `fromSite` у StatFilter (стат найден только в data/stats сайта — фолбэк
// main); без полей редактора предметов (`itemEditorSelection`, `tempAugmentStorage`) и `Suggestion` (подсказки
// крафта) — редактор не переносится; пояснения полей по-русски.

import type { BaseType } from '../../data/interfaces'
import type { ItemCategory, ItemInfluence, StatCalculated } from '../../parser'

/**
 * Статус листингов trade2 (`query.status.option`):
 *  - `available` — купить сразу: мгновенный выкуп + продавцы в игре (по умолчанию в POETH, как у PoE1);
 *  - `securable` — только мгновенный выкуп (покупка на сайте);
 *  - `online` — только продавцы в игре (whisper);
 *  - `any` — все, включая офлайн.
 * У обмена (bulk) своих статусов два-три: `online` / `onlineleague` / `any` (см. query/bulk.ts).
 */
export type ListingType = 'available' | 'securable' | 'online' | 'any'
export const LISTING_TYPES: readonly ListingType[] = ['available', 'securable', 'online', 'any']

export interface FilterPreset {
  /** i18n-ключ: filters.preset_pseudo / filters.preset_exact / filters.preset_base_item */
  id: string
  filters: ItemFilters
  stats: StatFilter[]
}

interface SearchFilter {
  /** локализованное имя (для показа) */
  name?: string
  /** английское имя — в запрос */
  nameTrade?: string
  baseType?: string
  baseTypeTrade?: string
  category?: ItemCategory
}

export interface ItemFilters {
  searchExact: SearchFilter
  /** поиск по категории вместо базы (включается/выключается в UI) */
  searchRelaxed?: SearchFilter & { disabled: boolean }
  discriminator?: {
    value?: string
    trade: string
  }
  rarity?: {
    value: string
  }
  /** гнёзда камня */
  socketNumber?: FilterNumeric
  linkedSockets?: FilterNumeric
  whiteSockets?: FilterNumeric
  /** гнёзда рун (на сайте — rune_sockets) */
  augmentSockets?: FilterNumeric
  corrupted?: {
    value: boolean
    exact?: boolean
  }
  fractured?: {
    value: boolean
  }
  mirrored?: {
    disabled: boolean
  }
  sanctified?: {
    disabled: boolean
  }
  foil?: {
    disabled: boolean
  }
  influences?: Array<{
    value: ItemInfluence
    disabled: boolean
  }>
  quality?: FilterNumeric
  gemLevel?: FilterNumeric
  /** тир путевого камня (waystone) */
  mapTier?: FilterNumeric
  mapBlighted?: {
    value: 'Blighted' | 'Blight-ravaged'
  }
  itemLevel?: FilterNumeric
  stackSize?: FilterNumeric
  unidentified?: {
    value: true
    disabled: boolean
  }
  unidentifiedTier?: {
    value: number
    disabled: boolean
  }
  veiled?: {
    statRefs: string[]
    veiledCount: number
    disabled: boolean
  }
  awardedAscendancyPoints?: FilterNumeric
  ultimatumHint?: {
    value: 'Victorious' | 'Cowardly' | 'Deadly'
    disabled: boolean
  }
  areaLevel?: FilterNumeric
  heistWingsRevealed?: FilterNumeric
  sentinelCharge?: FilterNumeric
  trade: {
    offline: boolean
    onlineInLeague: boolean
    /** `onlineleague` — только у обмена (в UI не показывается) */
    listingType: ListingType | 'onlineleague'
    listed: string | null
    currency: string | null
    league: string
    collapseListings: 'api' | 'app'
  }
  requires?: {
    level?: FilterNumeric
    str?: FilterNumeric
    dex?: FilterNumeric
    int?: FilterNumeric
  }
}

export interface FilterNumeric {
  value: number
  max?: number | undefined
  disabled: boolean
}

export interface FilterDropdown {
  value: string
  disabled: boolean
  options: Array<{ label: string; value: string }>
}

export interface StatFilterRoll {
  value: number
  min: number | '' | undefined // NOTE: mutable in UI
  max: number | '' | undefined // NOTE: mutable in UI
  default: { min: number; max: number }
  bounds?: { min: number; max: number }
  tradeInvert?: boolean
  dp: boolean
  isNegated: boolean
  /** 0…1 — насколько хорош ролл внутри диапазона (1 — максимум) */
  goodness?: number
}

export interface StatFilter {
  tradeId: string[]
  /** английский шаблон стата — одинаков для EN и RU */
  statRef: string
  /** текст на языке предмета (для показа) */
  text: string
  tag: FilterTag
  oils?: string[]
  sources: StatCalculated['sources']
  roll?: StatFilterRoll
  option?: {
    value: number // NOTE: mutable in UI
  }
  /** i18n-ключ причины, почему фильтр скрыт по умолчанию */
  hidden?: string
  disabled: boolean // NOTE: mutable in UI
  additionalInfo?: {
    elementalInfo?: {
      [key: string]: StatFilterRoll
    }
    emptyModifierInfo?: Record<ItemHasEmptyModifier, number>
  }
  editorAdded?: BaseType
  /** POETH: стат найден только в данных сайта трейда (мод нового патча, нет в данных EE2) */
  fromSite?: true
}

export const _INTERNAL_TRADE_IDS = [
  // #region DO NOT ADD OR REMOVE
  'item.base_percentile',
  'item.armour',
  'item.evasion_rating',
  'item.energy_shield',
  'item.block',
  'item.total_dps',
  'item.physical_dps',
  'item.elemental_dps',
  'item.crit',
  'item.aps',
  'item.has_empty_modifier',
  'item.spirit',
  // #endregion DO NOT ADD OR REMOVE
  // KEEP AS 12 number, maybe fix this to be better later
  'item.has_elemental_affix',
  'item.has_elemental_fire_affix',
  'item.has_elemental_cold_affix',
  'item.has_elemental_lightning_affix',
  // KEEP above in order and as 12-15
  'item.reload_time',
  'item.rarity_magic',
  'item.map_revives',
  'item.map_pack_size',
  'item.map_drop_chance',
  'item.map_item_rarity',
  'item.map_magic_monsters',
  'item.map_rare_monsters',
  'item.map_gold',
  'item.runic_ward',
  'item.duplicates'
] as const

export type InternalTradeId = (typeof _INTERNAL_TRADE_IDS)[number]
export const INTERNAL_TRADE_IDS = _INTERNAL_TRADE_IDS as readonly string[]

export enum ItemHasEmptyModifier {
  Any = 0,
  Prefix = 1,
  Suffix = 2
}
export enum ItemIsElementalModifier {
  Any = 0,
  Fire = 1,
  Cold = 2,
  Lightning = 3
}

export enum FilterTag {
  Pseudo = 'pseudo',
  Explicit = 'explicit',
  Implicit = 'implicit',
  Crafted = 'crafted',
  Enchant = 'enchant',
  Scourge = 'scourge',
  Fractured = 'fractured',
  Corrupted = 'corrupted',
  Synthesised = 'synthesised',
  Eldritch = 'eldritch',
  Variant = 'variant',
  Property = 'property',
  Shaper = 'explicit-shaper',
  Elder = 'explicit-elder',
  Crusader = 'explicit-crusader',
  Hunter = 'explicit-hunter',
  Redeemer = 'explicit-redeemer',
  Warlord = 'explicit-warlord',
  Delve = 'explicit-delve',
  Unveiled = 'explicit-veiled',
  Incursion = 'explicit-incursion',
  Augment = 'rune',
  AddedAugment = 'added-rune',
  Desecrated = 'desecrated',
  Skill = 'skill',
  Mutated = 'mutated'
}
