// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/parser/ParsedItem.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: поля `lang` (язык текста) и `textFormat` (расширенный/обычный Ctrl+C) — как у PoE1.

import type { ModifierType, StatCalculated } from './modifiers'
import type { ParsedModifier } from './advanced-mod-desc'
import type { AugmentLineData, BaseType, Poe2Lang } from '../data/interfaces'
import type { ItemCategory } from './meta'

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

/** Руна / ядро души в гнезде (EE2: элемент редактора аугментов). */
export interface EditorItem {
  existing?: true
  socketBound?: boolean
  name: string
  refName: string
  icon: string
  displayString: string
  stats: AugmentLineData[]
  baseItem: BaseType
}

export interface ParsedItem {
  /** POETH: язык текста предмета — им же выбраны данные (`d.lang`) */
  lang: Poe2Lang
  /** POETH: `advanced` — расширенный Ctrl+Alt+C (строки `{ … }` с тирами), `plain` — обычный Ctrl+C */
  textFormat: 'advanced' | 'plain'
  rarity?: ItemRarity
  itemLevel?: number
  armourAR?: number
  armourEV?: number
  armourES?: number
  armourRW?: number
  armourBLOCK?: number
  basePercentile?: number
  weaponCRIT?: number
  weaponAS?: number
  weaponPHYSICAL?: number
  weaponELEMENTAL?: number
  weaponFIRE?: number
  weaponCOLD?: number
  weaponLIGHTNING?: number
  weaponCHAOS?: number
  weaponRELOAD?: number
  weaponSPIRIT?: number
  mapBlighted?: 'Blighted' | 'Blight-ravaged'
  mapTier?: number
  mapPackSize?: number
  mapItemRarity?: number
  mapRevives?: number
  mapDropChance?: number
  // doesn't exist in 0.5.2
  mapMagicMonsters?: number
  // doesn't exist in 0.5.2
  mapRareMonsters?: number
  // doesn't exist in 0.5.2
  mapGold?: number
  mapMonsterRarity?: number
  mapEffectiveness?: number
  gemLevel?: number
  areaLevel?: number
  talismanTier?: number
  quality?: number
  qualityType?: string
  augmentSockets?: {
    empty: number
    current: number
    normal: number
    augments: Array<EditorItem | null>
  }
  gemSockets?: {
    number: number
    linked?: number // only 5 or 6
    white: number
  }
  stackSize?: { value: number; max: number }
  isUnidentified: boolean
  isCorrupted: boolean
  isUnmodifiable?: boolean
  isMirrored?: boolean
  isSanctified?: boolean
  influences: ItemInfluence[]
  logbookAreaMods?: ParsedModifier[][]
  sentinelCharge?: number
  isSynthesised?: boolean
  isFractured?: boolean
  isVeiled?: boolean
  isFoil?: boolean
  statsByType: StatCalculated[]
  newMods: ParsedModifier[]
  /** строки модов, которые не удалось сопоставить со статом («не распознан»): в поиск не идут */
  unknownModifiers: Array<{
    text: string
    type: ModifierType
  }>
  heist?: {
    wingsRevealed?: number
    target?: 'Enchants' | 'Trinkets' | 'Gems' | 'Replicas'
  }
  note?: string
  category?: ItemCategory
  requires?: {
    level: number
    str: number
    dex: number
    int: number
  }
  unidentifiedTier?: number
  trials?: {
    numberOfTrials?: number
    ultimatumHint?: 'Victorious' | 'Cowardly' | 'Deadly'
  }
  info: BaseType
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

export function itemIsModifiable(item: ParsedItem): boolean {
  return Boolean(item.info.craftable && !item.isCorrupted && !item.isMirrored && !item.isSanctified)
}
