// POETH (S61): что показывает блок «у Ange» окна цены PoE 2 — числа уже в единице показа (как priceBlock.ts S24 у
// PoE 1). Главная строка — «≈ N ex за штуку · у Ange» (от 1 div — в divine), стопка игрока — сумма, рынки «за exalted /
// chaos / divine» — каждый в своей валюте; дешевле 0.01 базы за штуку — «1 div за N шт.». Чистый TS;
// tests/poe2/priceBlock.test.ts.

import type { Poe1Price } from '../../poe1/pricecheck/results'
import { DIVINE_ID, EXALTED_ID, CHAOS_ID, type AngeBase, type AngeMarket, type AngePrice } from './ange'
import { exaltedIn, roundDivine2, roundExalted, unitFor2, type Poe2Unit } from './currency'

export interface AngeRowView {
  base: AngeBase
  /** цена 1 шт. в валюте рынка; нет — дешевле 0.01 базы, см. perBase */
  each?: Poe1Price
  /** штук за 1 базу (когда 1 шт. дешевле 0.01 базы) */
  perBase?: number
  /** диапазон сделок часа в валюте рынка (равны — диапазона нет) */
  lo?: number
  hi?: number
  volume: number
}

export interface AngeView {
  /** что это: обычный предмет, сама база цен (exalted) или курс (divine, chaos) */
  kind: 'price' | 'exalted' | 'rate'
  /** «≈ N ex за штуку» — от 1 div в divine */
  each: Poe1Price
  /** exalted за 1 шт. меньше 1: сколько штук за 1 ex */
  perExalted?: number
  /** вся стопка игрока (больше 1 шт.) */
  stack?: Poe1Price
  rows: AngeRowView[]
  /** штук за час на всех рынках */
  volume: number
}

function inBase(base: AngeBase, v: number): number {
  return base === 'divine' ? roundDivine2(v) : base === 'exalted' && v < 1 ? Math.round(v * 100) / 100 : roundExalted(v)
}

function row(m: AngeMarket): AngeRowView {
  if (m.each < 0.01) return { base: m.base, perBase: Math.round(1 / m.each), volume: m.volume }
  const lo = inBase(m.base, m.lo)
  const hi = inBase(m.base, m.hi)
  return { base: m.base, each: { amount: inBase(m.base, m.each), currency: m.base }, ...(lo !== hi ? { lo, hi } : {}), volume: m.volume }
}

/** Единица главной строки: Divine Orb — курс, «1 div ≈ N ex» (в divine это просто «1»); остальное — по уровню цены. */
export function angeUnit(a: Pick<AngePrice, 'id' | 'exalted' | 'exaltedPerDivine'>, exalted = a.exalted): Poe2Unit {
  return a.id === DIVINE_ID ? 'exalted' : unitFor2(exalted, a.exaltedPerDivine)
}

export function angeView(a: AngePrice, stack = 1): AngeView {
  const rate = a.exaltedPerDivine
  const unit = angeUnit(a)
  const total = a.exalted * stack
  const kind = a.id === EXALTED_ID ? 'exalted' : a.id === DIVINE_ID || a.id === CHAOS_ID ? 'rate' : 'price'
  // стопка Divine Orb в divine — просто число штук: показываем в exalted
  const stackUnit = angeUnit(a, total)
  return {
    kind,
    each: exaltedIn(a.exalted, unit, rate),
    ...(a.exalted > 0 && a.exalted < 1 ? { perExalted: Math.round(1 / a.exalted) } : {}),
    ...(stack > 1 ? { stack: exaltedIn(total, stackUnit, rate) } : {}),
    rows: [a.main, ...a.others].map(row),
    volume: a.main.volume + a.others.reduce((s, m) => s + m.volume, 0)
  }
}

// ---------------------------------------------------------------- обмен trade2 (у Ange цены нет)

/** Сколько лучших предложений обмена усреднять для «≈ N за штуку» (спецификация дизайнера, раздел 5). */
export const BULK_BEST = 5

export interface BulkView {
  /** «≈ N за штуку»: средняя цена 1 шт. у лучших предложений (exalted по курсу; без курса — в валюте лучшего) */
  each: Poe1Price
  /** вся стопка игрока (больше 1 шт.) */
  stack?: Poe1Price
  /** по скольким предложениям */
  by: number
}

/**
 * Сводка обмена trade2: предложения уже по порядку (orderBulkOffers). Курсы есть — первые BULK_BEST с известным
 * курсом в exalted; нет — только в валюте лучшего предложения. Пусто — undefined.
 */
export function bulkView(
  offers: ReadonlyArray<{ exchangeAmount: number; itemAmount: number; currency: string }>,
  rates: Readonly<Record<string, number>> | undefined,
  stack = 1
): BulkView | undefined {
  const valid = offers.filter((o) => o.itemAmount > 0 && o.exchangeAmount > 0)
  if (!valid.length) return undefined
  const each = (o: (typeof valid)[number]): number => o.exchangeAmount / o.itemAmount
  const inEx = rates
    ? valid
        .map((o) => (o.currency === 'exalted' ? each(o) : rates[o.currency] > 0 ? each(o) * rates[o.currency] : undefined))
        .filter((v): v is number => v != null)
        .slice(0, BULK_BEST)
    : []
  if (inEx.length) {
    const mean = inEx.reduce((s, v) => s + v, 0) / inEx.length
    const div = rates?.divine
    return {
      each: exaltedIn(mean, unitFor2(mean, div), div),
      ...(stack > 1 ? { stack: exaltedIn(mean * stack, unitFor2(mean * stack, div), div) } : {}),
      by: inEx.length
    }
  }
  const currency = valid[0].currency
  const same = valid.filter((o) => o.currency === currency).slice(0, BULK_BEST).map(each)
  const mean = same.reduce((s, v) => s + v, 0) / same.length
  const round = (v: number): number => (currency === 'divine' ? roundDivine2(v) : v < 1 ? Math.max(0.01, Math.round(v * 100) / 100) : roundExalted(v))
  return {
    each: { amount: round(mean), currency },
    ...(stack > 1 ? { stack: { amount: round(mean * stack), currency } } : {}),
    by: same.length
  }
}

/** Дроби курса для подсказки: 0.1 … 1 div в exalted. */
export function rateFractions2(exaltedPerDivine: number): Array<{ div: number; exalted: number }> {
  if (!(exaltedPerDivine > 0)) return []
  return [0.1, 0.25, 0.5, 0.75, 1].map((div) => ({ div, exalted: roundExalted(div * exaltedPerDivine) }))
}
