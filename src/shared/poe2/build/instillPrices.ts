// Цены эмоций для «Вложения» PoE 2 (S66; чистый модуль, tests/build2/instillPrices.test.ts).
// Два источника, своего формата цен нет:
//  - обмен у Ange — почасовой фид обмена GGG realm poe2 (S61, trade.poe2Ange): главный, это и есть цена в игре;
//  - снимок poe.ninja PoE 2 в пакете данных (S67, loadPoe2Prices → table.byName(id рецепта, эмоции)) — запасной,
//    для эмоций, которые у Ange за сутки не меняли.
// Результат — exalted за 1 шт. по английскому имени (как ждёт instillCost) и откуда цена — для подвала «источник».

import type { Poe2AngeResult } from '../pricecheck/ange'
import { KIND_GROUPS, type LoadedPoe2Prices, type Poe2PriceMatch } from '../prices'
import type { Emotion } from './instill'

export type EmotionPriceSource = 'ange' | 'ninja'

export interface EmotionPrice {
  /** exalted за 1 шт. */
  exalted: number
  source: EmotionPriceSource
  /** мало сделок или данные не свежие — цена примерная */
  low: boolean
}

export interface EmotionPrices {
  /** английское имя эмоции → exalted за 1 шт. (для instillCost) */
  byName: Map<string, number>
  /** английское имя → цена и откуда */
  each: Map<string, EmotionPrice>
  /** exalted за 1 divine: курс обмена у Ange, нет — курс снимка poe.ninja */
  exaltedPerDivine: number | null
  /** обмен у Ange дал хотя бы одну цену: последний час фида (мс) */
  ange: { hour: number } | null
  /** снимок poe.ninja дал хотя бы одну цену: когда снят, какая лига и как она выбрана */
  ninja: { at: number; league: string; match: Poe2PriceMatch } | null
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/** Сложить цены эмоций из ответа Ange и снимка poe.ninja; ни одной цены — null. */
export function mergeEmotionPrices(
  emotions: readonly Emotion[],
  ange: Poe2AngeResult | null | undefined,
  ninja: LoadedPoe2Prices | null | undefined
): EmotionPrices | null {
  const each = new Map<string, EmotionPrice>()
  let fromAnge = false
  let fromNinja = false
  for (const e of emotions) {
    const a = ange?.ok ? ange.prices[e.en] : undefined
    if (a && positive(a.exalted)) {
      each.set(e.en, { exalted: a.exalted, source: 'ange', low: !!a.low })
      fromAnge = true
      continue
    }
    // id рецепта GGG («LiquidParanoia») — тот же ключ, что имя и id poe.ninja (priceKey S67)
    const n = ninja?.table.byName(e.id, { kinds: KIND_GROUPS.emotions })
    if (n && positive(n.exalted)) {
      each.set(e.en, { exalted: n.exalted, source: 'ninja', low: n.low })
      fromNinja = true
    }
  }
  if (!each.size) return null
  const rate = ange?.ok && positive(ange.rate.exaltedPerDivine) ? ange.rate.exaltedPerDivine : ninja?.table.exaltedPerDivine
  return {
    byName: new Map([...each].map(([k, v]) => [k, v.exalted])),
    each,
    exaltedPerDivine: positive(rate) ? rate : null,
    ange: fromAnge && ange?.ok ? { hour: ange.rate.hour } : null,
    ninja: fromNinja && ninja ? { at: ninja.at, league: ninja.league, match: ninja.match } : null
  }
}
