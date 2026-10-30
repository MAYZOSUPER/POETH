// POETH: компактная стабильная сводка разобранного предмета PoE2 — для снапшот-тестов, логов и отладочного UI
// (как src/shared/poe1/parser/summary.ts). Только то, что не зависит от языка текста (EN-имена, ref статов,
// trade id, числа), плюс нераспознанные строки.

import type { ParsedItem } from './ParsedItem'
import { statSourcesTotal } from './modifiers'

export interface ItemSummary {
  lang: ParsedItem['lang']
  format: ParsedItem['textFormat']
  category?: string
  rarity?: string
  /** EN: имя уника / базы / камня */
  refName: string
  /** EN: база уника */
  uniqueBase?: string
  props: Record<string, unknown>
  stats: Array<{ type: string; ref: string; tradeIds: string[]; value?: number; min?: number; max?: number }>
  unknown: Array<{ type: string; text: string }>
}

const round = (n: number | undefined) => (n == null ? undefined : Math.round(n * 1000) / 1000)

const PROP_KEYS = [
  'itemLevel',
  'quality',
  'qualityType',
  'gemLevel',
  'requires',
  'talismanTier',
  'stackSize',
  'gemSockets',
  'armourAR',
  'armourEV',
  'armourES',
  'armourRW',
  'armourBLOCK',
  'basePercentile',
  'weaponCRIT',
  'weaponAS',
  'weaponPHYSICAL',
  'weaponELEMENTAL',
  'weaponFIRE',
  'weaponCOLD',
  'weaponLIGHTNING',
  'weaponCHAOS',
  'weaponRELOAD',
  'weaponSPIRIT',
  'mapTier',
  'mapBlighted',
  'mapRevives',
  'mapPackSize',
  'mapMagicMonsters',
  'mapRareMonsters',
  'mapDropChance',
  'mapItemRarity',
  'mapMonsterRarity',
  'mapEffectiveness',
  'mapGold',
  'areaLevel',
  'isUnidentified',
  'unidentifiedTier',
  'isCorrupted',
  'isUnmodifiable',
  'isMirrored',
  'isSanctified',
  'isSynthesised',
  'isFractured',
  'isVeiled',
  'isFoil',
  'sentinelCharge',
  'heist',
  'trials',
  'note'
] as const

export function summarizeItem(item: ParsedItem): ItemSummary {
  const props: Record<string, unknown> = {}
  for (const key of PROP_KEYS) {
    const v = item[key]
    if (v === undefined || v === false) continue
    props[key] = typeof v === 'number' ? round(v) : v
  }
  if (item.influences.length) props.influences = [...item.influences].sort()
  if (item.augmentSockets) {
    const { empty, current, normal, augments } = item.augmentSockets
    props.augmentSockets = { empty, current, normal, augments: augments.map((a) => a?.refName ?? null) }
  }

  return {
    lang: item.lang,
    format: item.textFormat,
    category: item.category,
    rarity: item.rarity,
    refName: item.info.refName,
    uniqueBase: item.info.unique?.base,
    props,
    stats: item.statsByType.map((calc) => {
      const roll = statSourcesTotal(calc.sources)
      const tradeType = calc.type === 'added-rune' ? 'rune' : calc.type
      return {
        type: calc.type,
        ref: calc.stat.ref,
        tradeIds: calc.stat.trade.ids[tradeType] ?? [],
        ...(roll ? { value: round(roll.value), min: round(roll.min), max: round(roll.max) } : {})
      }
    }),
    unknown: item.unknownModifiers.map((m) => ({ type: m.type, text: m.text }))
  }
}
