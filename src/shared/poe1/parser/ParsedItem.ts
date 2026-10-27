// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/parser/ParsedItem.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: поля `lang` (язык текста), `textFormat` (расширенный/обычный Ctrl+C),
// `timeless` (сид и завоеватель timeless-джуэла).

import type { ModifierType, StatCalculated } from './modifiers'
import type { ParsedModifier } from './advanced-mod-desc'
import type { ParsedStat } from './stat-translations'
import type { BaseType, Poe1Lang } from '../data/interfaces'
import type { ItemCategory } from './meta'
import type { TimelessJewelInfo } from './timeless'

export enum ItemRarity {
  Normal = 'Normal',
  Magic = 'Magic',
  Rare = 'Rare',
  Unique = 'Unique'
}

export enum ItemInfluence {
  Crusader = 'Crusader',
  Elder = 'Elder',
  Hunter = 'Hunter',
  Redeemer = 'Redeemer',
  Shaper = 'Shaper',
  Warlord = 'Warlord'
}

export interface ParsedItem {
  /** POETH: язык текста предмета (по первой строке) — им же выбраны данные */
  lang: Poe1Lang
  /** POETH: `advanced` — расширенный Ctrl+C (строки `{ … }` с тирами), `plain` — обычный/текст с трейда */
  textFormat: 'advanced' | 'plain'
  rarity?: ItemRarity
  itemLevel?: number

  armourAR?: number
  armourEV?: number
  armourES?: number
  armourWARD?: number
  armourBLOCK?: number
  basePercentile?: number
  weaponCRIT?: number
  weaponAS?: number
  weaponPHYSICAL?: number
  weaponELEMENTAL?: number

  mapArea?: BaseType
  areaLevel?: number
  areaItemQuantity?: number
  areaItemRarity?: number
  areaPackSize?: number
  mapCompletionReward?: BaseType
  mapTier?: number
  mapMoreMaps?: number
  mapMoreScarabs?: number
  mapMoreCurrency?: number
  mapMoreDivCards?: number
  heistBlueprint?: {
    wingsRevealed?: number
    wingsTotal?: number
    target?: 'Enchants' | 'Trinkets' | 'Gems' | 'Replicas'
  }
  heistContract?: {
    requiredJob?:
      | 'Lockpicking'
      | 'Brute Force'
      | 'Perception'
      | 'Demolition'
      | 'Counter-Thaumaturgy'
      | 'Trap Disarmament'
      | 'Agility'
      | 'Deception'
      | 'Engineering'
    jobLevel?: number
    targetValue?: 'Priceless'
  }
  logbookAreaMods?: ParsedModifier[][]
  chartSulphur?: number

  gemLevel?: number
  vaalGem?: BaseType
  imbuedGem?: boolean
  mercenaryBuild?: BaseType
  mercenarySkills?: ParsedStat[][]
  talismanTier?: number
  memoryStrands?: number
  quality?: number
  sockets?: {
    linked?: number // only 5 or 6
    white: number
  }
  stackSize?: { value: number; max: number }
  isUnidentified: boolean
  isCorrupted: boolean
  isUnmodifiable?: boolean
  isMirrored?: boolean
  isSplit?: boolean
  influences: ItemInfluence[]
  sentinelCharge?: number
  isSynthesised?: boolean
  isFractured?: boolean
  isVeiled?: boolean
  isFoil?: boolean
  isFoulborn?: boolean
  isVestigial?: boolean
  dustEquivalent?: number
  /** POETH: timeless-джуэл — сид и завоеватель */
  timeless?: TimelessJewelInfo
  statsByType: StatCalculated[]
  newMods: ParsedModifier[]
  /** строки модов, которые не удалось сопоставить со статом («не распознан»): в поиск не идут */
  unknownModifiers: Array<{
    text: string
    type: ModifierType
  }>
  category?: ItemCategory
  info: BaseType
  uniqueBase?: BaseType
  rawText: string
}

// NOTE: should match option values on trade
export enum IncursionRoom {
  Open = 1,
  Obstructed = 2
}

export function createVirtualItem(props: Partial<ParsedItem> & Pick<ParsedItem, 'info'>): ParsedItem {
  return {
    ...props,
    lang: props.lang ?? 'en',
    textFormat: props.textFormat ?? 'plain',
    isUnidentified: props.isUnidentified ?? false,
    isCorrupted: props.isCorrupted ?? false,
    newMods: props.newMods ?? [],
    statsByType: props.statsByType ?? [],
    unknownModifiers: props.unknownModifiers ?? [],
    influences: props.influences ?? [],
    rawText: 'VIRTUAL_ITEM'
  }
}
