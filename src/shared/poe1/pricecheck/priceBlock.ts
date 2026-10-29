// POETH (S24): что показывает блок цены окна — числа уже в единице показа. Правило: одна строка — одна единица
// (от 1 div — divine, ниже — chaos); вторая единица — только в подсказке у цены. Чистый TS;
// tests/pricecheck/priceBlock.test.ts (там же — тексты блока по словарю RU/EN).

import { DIVINE_ID } from '../../wealth/exchange'
import { chaosIn, roundDivine, toChaos, unitFor, type ChaosRates } from './currency'
import type { FaustusBase, FaustusPrice } from './faustus'
import type { MarketPrice, Poe1Price } from './results'
import { displayPrice } from './verdict'

export interface MarketView {
  /** единица строки; undefined — курсов нет, всё в валюте лотов */
  unit?: 'chaos' | 'divine'
  /** «~X» — округлено до понятного числа (как у вердикта) */
  mid: Poe1Price
  /** диапазон самых дешёвых лотов в той же единице */
  min: Poe1Price
  max: Poe1Price
  lots: number
  /** самые дешёвые в группах — в той же единице (валюта без курса — как есть) */
  instant?: Poe1Price
  person?: Poe1Price
}

export function marketView(m: MarketPrice, chaosPerDivine?: number, rates?: ChaosRates): MarketView {
  if (m.chaos == null) {
    return { mid: m.mid, min: m.min, max: m.max, lots: m.lots, ...(m.instant ? { instant: m.instant } : {}), ...(m.person ? { person: m.person } : {}) }
  }
  const unit = unitFor(m.chaos, chaosPerDivine)
  const inUnit = (p: Poe1Price): Poe1Price => {
    const c = toChaos(p, chaosPerDivine, rates)
    return c != null ? chaosIn(c, unit, chaosPerDivine) : p
  }
  return {
    unit,
    mid: displayPrice(m.mid, m.chaos, chaosPerDivine),
    min: chaosIn(m.min.amount, unit, chaosPerDivine),
    max: chaosIn(m.max.amount, unit, chaosPerDivine),
    lots: m.lots,
    ...(m.instant ? { instant: inUnit(m.instant) } : {}),
    ...(m.person ? { person: inUnit(m.person) } : {})
  }
}

export interface FaustusRowView {
  base: FaustusBase
  /** цена 1 шт. в валюте рынка */
  each: Poe1Price
  /** диапазон сделок часа (в той же валюте); равны — диапазона нет */
  lo: number
  hi: number
  volume: number
}

export interface FaustusView {
  /** главная цена 1 шт. — в валюте главного рынка */
  each: Poe1Price
  /** вся стопка игрока (больше 1 шт.): от 1 div — divine */
  stack?: Poe1Price
  rows: FaustusRowView[]
  /** штук за час на обоих рынках */
  volume: number
}

/** Цена обмена точная (не «понятное число»): divine — сотые, chaos — как chaosIn (меньше 1 c — сотые). */
function roundIn(base: FaustusBase, v: number): number {
  return base === 'divine' ? roundDivine(v) : chaosIn(v, 'chaos', undefined).amount
}

export function faustusView(f: FaustusPrice, stack = 1): FaustusView {
  const row = (m: FaustusPrice['main']): FaustusRowView => ({
    base: m.base,
    each: { amount: roundIn(m.base, m.each), currency: m.base },
    lo: roundIn(m.base, m.lo),
    hi: roundIn(m.base, m.hi),
    volume: m.volume
  })
  const rows = [row(f.main), ...(f.other ? [row(f.other)] : [])]
  const total = f.chaos * stack
  // стопка Divine Orb в divine — это просто число штук: показываем в chaos
  const stackUnit = f.id === DIVINE_ID ? 'chaos' : unitFor(total, f.chaosPerDivine)
  return {
    each: rows[0].each,
    ...(stack > 1 ? { stack: chaosIn(total, stackUnit, f.chaosPerDivine) } : {}),
    rows,
    volume: f.main.volume + (f.other?.volume ?? 0)
  }
}
