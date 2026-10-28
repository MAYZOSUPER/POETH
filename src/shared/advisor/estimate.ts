// Оценка стратегии по ценам (чистый модуль; tests/advisor/estimate.test.ts).
//
// Цены — тот же индекс, что у снимков тайника (shared/wealth/prices.ts: фид обмена GGG, затем
// poe.watch). Правила честности:
//  - нет цены — null, не 0: у покупного входа без цены стоимость и прибыль не считаются;
//  - у части добычи нет цены — доход и прибыль по известным ценам с пометкой «не меньше»
//    (цены положительны, неизвестная добыча может только прибавить);
//  - свой вход (own: карта с прошлых карт) в стоимость не идёт;
//  - уверенность ниже, если цены по малому числу сделок, есть добыча без цены или количества
//    черновые.

import type {
  AdvisorConfidence,
  AdvisorConfidenceReason,
  AdvisorItemRef,
  AdvisorLine,
  AdvisorMapEstimate,
  AdvisorPricedLine,
  AdvisorStrategy
} from '../types/advisor'
import type { PriceEntry, PriceIndex, PriceKind } from '../wealth/prices'

/** Доля стоимости по ценам «мало сделок», выше которой уверенность низкая. */
const LOW_SHARE = 0.5

const priceKind = (ref: AdvisorItemRef): PriceKind => (ref.kind === 'card' ? 'stackable' : ref.kind)

function median(list: readonly PriceEntry[]): PriceEntry {
  const sorted = [...list].sort((a, b) => a.chaos - b.chaos)
  return sorted[Math.floor((sorted.length - 1) / 2)]
}

/** Кандидаты под предмет стратегии (карты — по ярусу, уники — без 5–6 связей, камни — уровень и качество). */
function candidates(ref: AdvisorItemRef, list: readonly PriceEntry[]): readonly PriceEntry[] {
  switch (ref.kind) {
    case 'map': {
      const tiered = ref.tier !== undefined ? list.filter((e) => e.mapTier === ref.tier) : []
      return tiered.length ? tiered : list.filter((e) => e.mapTier === undefined)
    }
    case 'unique':
      return list.filter((e) => (e.links ?? 0) < 5)
    case 'gem':
      return list.filter(
        (e) => !e.corrupted && (e.gemLevel ?? 1) === (ref.level ?? 1) && (e.gemQuality ?? 0) === (ref.quality ?? 0)
      )
    default:
      return list
  }
}

/**
 * Цена штуки предмета стратегии: один кандидат — он; несколько — медиана с пометкой «мало
 * сделок» (непонятно, какой вариант); нет — null.
 */
export function priceOf(ref: AdvisorItemRef, index: PriceIndex): { chaos: number; source: PriceEntry['source']; low: boolean } | null {
  if (!ref.ref) return null
  const list = candidates(ref, index.get(priceKind(ref), ref.ref))
  if (!list.length) return null
  const e = list.length === 1 ? list[0] : median(list)
  return { chaos: e.chaos, source: e.source, low: list.length > 1 || e.low === true }
}

function priceLine(line: AdvisorLine, index: PriceIndex, input: boolean): AdvisorPricedLine {
  const p = priceOf(line.item, index)
  const out: AdvisorPricedLine = { unit: p ? p.chaos : null, total: null }
  if (p) {
    out.source = p.source
    if (p.low) out.low = true
  }
  if (input && line.own) out.total = 0
  else if (p) out.total = p.chaos * line.qty
  return out
}

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

/** Оценка одной карты стратегии по индексу цен лиги. */
export function estimateStrategy(s: AdvisorStrategy, index: PriceIndex): AdvisorMapEstimate {
  const inputs = s.inputs.map((l) => priceLine(l, index, true))
  const outputs = s.outputs.map((l) => priceLine(l, index, false))

  const cost = inputs.some((l) => l.total === null) ? null : sum(inputs.map((l) => l.total as number))
  const pricedOut = outputs.filter((l) => l.total !== null)
  const income = pricedOut.length ? sum(pricedOut.map((l) => l.total as number)) : null
  const incomePartial = income !== null && pricedOut.length < outputs.length
  const profit = cost !== null && income !== null ? income - cost : null

  const reasons: AdvisorConfidenceReason[] = []
  const counted = [...inputs, ...outputs].filter((l) => l.total !== null && l.total > 0)
  const value = sum(counted.map((l) => l.total as number))
  const lowValue = sum(counted.filter((l) => l.low).map((l) => l.total as number))
  if (lowValue > 0) reasons.push('low')
  if (incomePartial) reasons.push('partial')
  if (profit === null) reasons.push('noPrice')
  if (s.draft) reasons.push('draft')

  let confidence: AdvisorConfidence = 3
  if (profit === null || (value > 0 && lowValue / value > LOW_SHARE)) confidence = 1
  else if (lowValue > 0 || incomePartial || s.draft) confidence = 2

  return { inputs, outputs, cost, income, incomePartial, profit, confidence, reasons }
}
