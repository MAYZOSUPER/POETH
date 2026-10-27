// POETH: timeless-джуэлы — сид и завоеватель из разобранных модов.
// Моды вида «Commissioned 159200 coins to commemorate Cadiro / Passives in radius are Conquered by …» в данных
// APT — статы с `better: NotComparable`, `modFamily` (все завоеватели этого джуэла) и trade id
// `explicit.pseudo_timeless_jewel_<завоеватель>`. Число в моде — сид.
//
// Ограничение данных APT: 5 legacy-завоевателей (Zerphi, Kiloava, Deshret, Venarius, Chitus) в stats.ndjson
// нет — такой мод остаётся «не распознан», а здесь возвращается `recognized: false` с сидом и словом из текста.

import { StatBetter } from '../data/interfaces'
import type { ParsedItem } from './ParsedItem'

export interface TimelessJewelInfo {
  /** false — мод не найден в данных (legacy-завоеватель или новый мод патча) */
  recognized: boolean
  seed: number
  /** английское имя завоевателя (`Cadiro`), если распознан */
  conqueror?: string
  /** завоеватель как в тексте (последнее слово первой строки) — для нераспознанных */
  conquerorText?: string
  /** EN-шаблон стата */
  statRef?: string
  /** trade id стата, напр. `explicit.pseudo_timeless_jewel_cadiro` */
  tradeId?: string
  /** все завоеватели этого типа джуэла (EN-шаблоны), для поиска «любой завоеватель» */
  familyRefs?: string[]
}

const TRADE_ID_RE = /pseudo_timeless_jewel_([a-z]+)$/
export const TIMELESS_JEWEL_REF = 'Timeless Jewel'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function detectTimelessJewel(item: ParsedItem): TimelessJewelInfo | undefined {
  for (const calc of item.statsByType) {
    if (calc.stat.better !== StatBetter.NotComparable || !calc.stat.modFamily) continue
    const tradeId = Object.values(calc.stat.trade.ids)
      .flat()
      .find((id) => TRADE_ID_RE.test(id))
    if (!tradeId) continue
    const seed = calc.sources[0]?.stat.roll?.value
    if (seed == null) continue
    return {
      recognized: true,
      seed,
      conqueror: capitalize(TRADE_ID_RE.exec(tradeId)![1]),
      statRef: calc.stat.ref,
      tradeId,
      familyRefs: calc.stat.modFamily
    }
  }

  const isTimeless = item.info?.refName === TIMELESS_JEWEL_REF || item.uniqueBase?.refName === TIMELESS_JEWEL_REF
  if (!isTimeless) return undefined
  for (const mod of item.unknownModifiers) {
    const firstLine = mod.text.split('\n')[0]
    const m = /(\d{3,})/.exec(firstLine)
    if (!m) continue
    const words = firstLine.trim().split(/\s+/)
    return { recognized: false, seed: Number(m[1]), conquerorText: words[words.length - 1] }
  }
  return undefined
}
