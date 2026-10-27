// POETH: компактная стабильная сводка разобранного предмета — для снапшот-тестов, логов и отладочного UI.
// Только то, что не зависит от языка текста (EN-имена, ref статов, trade id), плюс нераспознанные строки.

import type { ParsedItem } from './ParsedItem'
import { statSourcesTotal } from './modifiers'

export interface ItemSummary {
  lang: ParsedItem['lang']
  format: ParsedItem['textFormat']
  category?: string
  rarity?: string
  /** EN: имя уника / базы / камня / карточки */
  refName: string
  /** EN: база уника */
  uniqueBase?: string
  props: Record<string, unknown>
  stats: Array<{ type: string; ref: string; tradeIds: string[]; value?: number; min?: number; max?: number }>
  unknown: Array<{ type: string; text: string }>
}

const round = (n: number | undefined) => (n == null ? undefined : Math.round(n * 1000) / 1000)

export function summarizeItem(item: ParsedItem): ItemSummary {
  const props: Record<string, unknown> = {}
  const keys = [
    'itemLevel', 'quality', 'gemLevel', 'mapTier', 'areaLevel', 'stackSize', 'sockets', 'talismanTier',
    'armourAR', 'armourEV', 'armourES', 'armourWARD', 'armourBLOCK', 'basePercentile',
    'weaponCRIT', 'weaponAS', 'weaponPHYSICAL', 'weaponELEMENTAL',
    'areaItemQuantity', 'areaItemRarity', 'areaPackSize', 'mapMoreMaps', 'mapMoreScarabs', 'mapMoreCurrency', 'mapMoreDivCards',
    'isUnidentified', 'isCorrupted', 'isUnmodifiable', 'isMirrored', 'isSplit', 'isSynthesised', 'isFractured', 'isVeiled',
    'isFoil', 'isFoulborn', 'isVestigial', 'imbuedGem', 'memoryStrands', 'dustEquivalent', 'timeless', 'heistContract',
    'heistBlueprint', 'chartSulphur', 'sentinelCharge'
  ] as const
  for (const key of keys) {
    const v = item[key]
    if (v === undefined || v === false) continue
    props[key] = v
  }
  if (item.influences.length) props.influences = [...item.influences].sort()
  if (item.vaalGem) props.vaalGem = item.vaalGem.refName
  if (item.mapArea) props.mapArea = item.mapArea.refName
  if (item.mapCompletionReward) props.mapCompletionReward = item.mapCompletionReward.refName

  return {
    lang: item.lang,
    format: item.textFormat,
    category: item.category,
    rarity: item.rarity,
    refName: item.info.refName,
    uniqueBase: item.uniqueBase?.refName,
    props,
    stats: item.statsByType.map((calc) => {
      const roll = statSourcesTotal(calc.sources)
      return {
        type: calc.type,
        ref: calc.stat.ref,
        tradeIds: calc.stat.trade.ids[calc.type] ?? [],
        ...(roll ? { value: round(roll.value), min: round(roll.min), max: round(roll.max) } : {})
      }
    }),
    unknown: item.unknownModifiers.map((m) => ({ type: m.type, text: m.text }))
  }
}
