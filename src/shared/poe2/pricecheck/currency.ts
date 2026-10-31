// POETH (S61): цены окна PoE 2 в одной шкале — exalted (база PoE 2). Курс exalted ↔ divine и exalted ↔ chaos —
// по фиду обмена GGG (ange.ts), прочие валюты лотов (regal, annul, vaal…) — по «цене у Ange». Курса нет — сравниваем
// только в одной валюте, как в S47. Одна строка — одна единица (как S24 у PoE 1): от 1 div по курсу — divine, ниже —
// exalted. Чистый TS; tests/poe2/currency.test.ts.

import type { Poe1Price } from '../../poe1/pricecheck/results'
import type { Poe2Rate } from './ange'

/** exalted за 1 шт. по trade tag валюты trade2 ('exalted' — 1). */
export type ExaltedRates = Readonly<Record<string, number>>

export type Poe2Unit = 'exalted' | 'divine'

/**
 * Курсы для сравнения цен лотов: exalted, divine и chaos по курсу и `more` — прочие валюты по обмену у Ange.
 * Нет курса divine — undefined (тогда цены сравниваются только в одной валюте).
 */
export function exaltedRates(rate: Pick<Poe2Rate, 'exaltedPerDivine' | 'exaltedPerChaos'> | null | undefined, more?: ExaltedRates): Record<string, number> | undefined {
  if (!rate || !(rate.exaltedPerDivine > 0)) return undefined
  return {
    ...more,
    exalted: 1,
    divine: rate.exaltedPerDivine,
    ...(rate.exaltedPerChaos && rate.exaltedPerChaos > 0 ? { chaos: rate.exaltedPerChaos } : {})
  }
}

/** Цена в exalted: exalted как есть, остальные — по `rates`; неизвестно — undefined. */
export function toExalted(price: Poe1Price, rates?: ExaltedRates): number | undefined {
  if (price.currency === 'exalted') return price.amount
  const r = rates?.[price.currency]
  return r != null && r > 0 ? price.amount * r : undefined
}

/** exalted: целые от 10, иначе одна десятая; не меньше 0.1 у ненулевых (как roundChaos у PoE 1). */
export function roundExalted(v: number): number {
  if (v >= 10) return Math.round(v)
  const r = Math.round(v * 10) / 10
  return r === 0 && v > 0 ? 0.1 : r
}

/** divine: сотые до 10, десятые до 100, дальше целые (как roundDivine у PoE 1). */
export function roundDivine2(v: number): number {
  if (v >= 100) return Math.round(v)
  if (v >= 10) return Math.round(v * 10) / 10
  const r = Math.round(v * 100) / 100
  return r === 0 && v > 0 ? 0.01 : r
}

/** Единица строки: от 1 div по курсу — divine, ниже (или без курса) — exalted. */
export function unitFor2(exalted: number, exaltedPerDivine: number | undefined): Poe2Unit {
  return exaltedPerDivine && exaltedPerDivine > 0 && exalted >= exaltedPerDivine ? 'divine' : 'exalted'
}

/** exalted-эквивалент в единице показа, округлённо; меньше 1 ex — сотые. */
export function exaltedIn(exalted: number, unit: Poe2Unit, exaltedPerDivine: number | undefined): Poe1Price {
  if (unit === 'divine' && exaltedPerDivine && exaltedPerDivine > 0) {
    return { amount: roundDivine2(exalted / exaltedPerDivine), currency: 'divine' }
  }
  if (exalted > 0 && exalted < 1) return { amount: Math.max(0.01, Math.round(exalted * 100) / 100), currency: 'exalted' }
  return { amount: roundExalted(exalted), currency: 'exalted' }
}

/**
 * Подсказка у цены — та же сумма в другой валюте: divine → exalted, exalted → divine (от 0.01 div), прочие валюты с
 * курсом (chaos, regal…) → exalted. Нет курса — null.
 */
export function convertPrice2(price: Poe1Price, rates: ExaltedRates | undefined): Poe1Price | null {
  if (!rates || !(price.amount > 0)) return null
  const div = rates.divine
  if (price.currency === 'exalted') {
    if (!(div > 0)) return null
    const v = price.amount / div
    return v >= 0.01 ? { amount: roundDivine2(v), currency: 'divine' } : null
  }
  const ex = toExalted(price, rates)
  return ex != null ? { amount: roundExalted(ex), currency: 'exalted' } : null
}
