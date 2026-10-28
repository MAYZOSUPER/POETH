// POETH: курс chaos ↔ divine для окна цены — плашка «1 div = N c», дроби в подсказке и эквивалент цены
// в другой валюте при наведении. Источник курса — почасовой фид обмена GGG (S11a, main); без курса UI
// просто прячет плашку и эквиваленты.

import type { Poe1Price } from './results'

export interface CurrencyRate {
  league: string
  /** сколько chaos за 1 divine */
  chaosPerDivine: number
  /** час фида обмена (ms), если известен */
  hour?: number
}

/** chaos: целые от 10, иначе одна десятая; не меньше 0.1 у ненулевых. */
export function roundChaos(v: number): number {
  if (v >= 10) return Math.round(v)
  const r = Math.round(v * 10) / 10
  return r === 0 && v > 0 ? 0.1 : r
}

/** divine: две значащие сотые (0.10, 1.25), крупные — одна десятая. */
export function roundDivine(v: number): number {
  if (v >= 100) return Math.round(v)
  if (v >= 10) return Math.round(v * 10) / 10
  const r = Math.round(v * 100) / 100
  return r === 0 && v > 0 ? 0.01 : r
}

export const RATE_FRACTIONS: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

/** Подсказка к плашке курса: 0.1 div = X c … 1 div = N c. */
export function rateFractions(chaosPerDivine: number): Array<{ div: number; chaos: number }> {
  if (!(chaosPerDivine > 0)) return []
  return RATE_FRACTIONS.map((div) => ({ div, chaos: roundChaos(div * chaosPerDivine) }))
}

const CHAOS = new Set(['chaos'])
const DIVINE = new Set(['divine'])

/** Цена в другой валюте: chaos → divine, divine → chaos; прочие валюты — null. */
export function convertPrice(price: Poe1Price, chaosPerDivine: number | undefined): Poe1Price | null {
  if (!chaosPerDivine || !(chaosPerDivine > 0) || !(price.amount > 0)) return null
  if (CHAOS.has(price.currency)) return { amount: roundDivine(price.amount / chaosPerDivine), currency: 'divine' }
  if (DIVINE.has(price.currency)) return { amount: roundChaos(price.amount * chaosPerDivine), currency: 'chaos' }
  return null
}
