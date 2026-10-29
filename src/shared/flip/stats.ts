// Статистика пары «предмет X против базы chaos/divine» по часам фида (чистый модуль; tests/flip/stats.test.ts).
//
// В фиде пара хранится в любом порядке [A, B]; все величины приводим к одному направлению — «сколько базы за
// одну штуку X». lowest/highest_ratio в фиде — минимум и максимум отношения A:B за час; после разворота
// минимум становится максимумом, поэтому lo/hi = min/max двух приведённых цен.

import type { FlipBase } from '../types/flip'
import { CHAOS_ID, DIVINE_ID } from '../wealth/exchange'
import type { FullHour, FullMarket } from './feed'

export const BASE_ID: Record<FlipBase, string> = { chaos: CHAOS_ID, divine: DIVINE_ID }

/** Час пары в приведённом виде. */
export interface PairHour {
  hour: number
  /** штук X и базы в сделках */
  volX: number
  volBase: number
  /** min/max приведённых соотношений (база за штуку X); 0 — нет данных */
  lo: number
  hi: number
  /** наименьший стакан за час: штук X и базы */
  stockX: number
  stockBase: number
}

/** Рынок → час пары X/база в приведённом виде; null — рынок не про эту пару. */
export function normalizeMarket(m: FullMarket, hour: number, item: string, base: FlipBase): PairHour | null {
  const b = BASE_ID[base]
  const [, a, c, va, vc, loA, loC, hiA, hiC, lsA, lsC] = m
  let xFirst: boolean
  if (a === item && c === b) xFirst = true
  else if (a === b && c === item) xFirst = false
  else return null
  // приведённая цена: базы за одну штуку X
  const price = (rx: number, rb: number): number => (rx > 0 && rb > 0 ? rb / rx : 0)
  const pLow = xFirst ? price(loA, loC) : price(loC, loA)
  const pHigh = xFirst ? price(hiA, hiC) : price(hiC, hiA)
  const ps = [pLow, pHigh].filter((p) => p > 0)
  return {
    hour,
    volX: xFirst ? va : vc,
    volBase: xFirst ? vc : va,
    lo: ps.length ? Math.min(...ps) : 0,
    hi: ps.length ? Math.max(...ps) : 0,
    stockX: xFirst ? lsA : lsC,
    stockBase: xFirst ? lsC : lsA
  }
}

/** Часы пары по всем часам фида лиги (от старых к новым). */
export function pairHours(hours: readonly FullHour[], league: string, item: string, base: FlipBase): PairHour[] {
  const out: PairHour[] = []
  for (const h of hours) {
    for (const m of h.markets) {
      if (m[0] !== league) continue
      const p = normalizeMarket(m, h.hour, item, base)
      if (p) {
        out.push(p)
        break
      }
    }
  }
  return out.sort((x, y) => x.hour - y.hour)
}

/** Взвешенная медиана; пусто — 0. */
export function weightedMedian(values: ReadonlyArray<{ v: number; w: number }>): number {
  const xs = values.filter((x) => x.w > 0 && x.v > 0).sort((a, b) => a.v - b.v)
  const total = xs.reduce((s, x) => s + x.w, 0)
  if (!total) return 0
  let acc = 0
  for (const x of xs) {
    acc += x.w
    if (acc >= total / 2) return x.v
  }
  return xs[xs.length - 1].v
}

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface PairStats {
  window: number
  /** база за штуку X: VWAP окна */
  vwap: number
  /** взвешенные (по объёму X) медианы приведённых min/max соотношений */
  lo: number
  hi: number
  /** (hi − lo) / vwap */
  spread: number
  /** chaos-экв. в час (объём базы × цена базы / часов окна) */
  liquidity: number
  /** часов со сделками */
  activeHours: number
  /** коэффициент вариации почасового VWAP */
  volatility: number
  /** медиана наименьшего стакана, в штуках X (меньшая из сторон) */
  depth: number
  /** штук X в сделках за окно */
  volume: number
}

/**
 * Статистика пары за последние `window` часов (окно отсчитывается от `lastHour` — последнего часа фида).
 * `baseChaos` — цена базы в chaos (chaos — 1, divine — курс).
 */
export function pairStats(ph: readonly PairHour[], lastHour: number, window: number, baseChaos: number): PairStats {
  const from = lastHour - (window - 1) * 3600
  const hs = ph.filter((h) => h.hour >= from && h.hour <= lastHour)
  const traded = hs.filter((h) => h.volX > 0 && h.volBase > 0)
  const volX = traded.reduce((s, h) => s + h.volX, 0)
  const volBase = traded.reduce((s, h) => s + h.volBase, 0)
  const vwap = volX > 0 ? volBase / volX : 0
  const lo = weightedMedian(traded.map((h) => ({ v: h.lo, w: h.volX })))
  const hi = weightedMedian(traded.map((h) => ({ v: h.hi, w: h.volX })))
  const prices = traded.map((h) => h.volBase / h.volX)
  let volatility = 0
  if (prices.length > 1) {
    const mean = prices.reduce((s, p) => s + p, 0) / prices.length
    const sd = Math.sqrt(prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length)
    volatility = mean > 0 ? sd / mean : 0
  }
  const depths = hs
    .filter((h) => h.stockX > 0 || h.stockBase > 0)
    .map((h) => {
      const p = h.volX > 0 && h.volBase > 0 ? h.volBase / h.volX : vwap
      const baseSide = p > 0 ? h.stockBase / p : 0
      return Math.min(h.stockX, baseSide)
    })
  return {
    window,
    vwap,
    lo,
    hi,
    spread: vwap > 0 && lo > 0 && hi > 0 ? (hi - lo) / vwap : 0,
    liquidity: (volBase * baseChaos) / window,
    activeHours: traded.length,
    volatility,
    depth: median(depths),
    volume: volX
  }
}

/** Полураспад веса часа, ч: последние 1–3 часа весят больше суток. */
export const RECENT_HALF_LIFE = 2
/**
 * Доля пути от свежего VWAP к краю сделок (hi для покупки, lo для продажи), где ставить цель ордера.
 * Подобрано по неделе фида Allflame (28.10–29.10, 38 тыс. рынко-часов с ликвидностью ≥ 2 div/ч): цель покупки
 * не ниже цены следующего часа в 71 % часов (старая цель «медиана lo за сутки» — в 19 %), переплата к VWAP
 * следующего часа — медиана 6 %.
 */
export const REAL_PUSH = 0.5

/** Цель ордера и диапазон «в игре, скорее всего» (база за штуку X). */
export interface RealSide {
  at: number
  lo: number
  hi: number
}

/** Реалистичные цены пары «сейчас»: покупка X — от VWAP к стороне продавцов, продажа — к стороне покупателей. */
export interface RealPrices {
  /** свежий VWAP: часы по объёму, вес часа падает вдвое каждые RECENT_HALF_LIFE часов */
  mid: number
  buy: RealSide
  sell: RealSide
}

/**
 * Сколько реально заплатить за штуку X и сколько за неё получить по последним часам фида.
 *
 * lowest/highest_ratio часа — крайние соотношения за час; по данным похоже, что hi — покупка сразу у продавцов
 * (сторона запаса X), lo — продажа сразу покупателям (часами держится одна «стена» заявок, напр. Valdo 1:273).
 * Медиана lo за сутки — не цена «сейчас»: свежий ордер на покупку по ней почти не исполняется. Поэтому покупка —
 * между свежим VWAP и hi (цель — посередине), продажа — между lo и VWAP.
 * hi и lo часов — взвешенные медианы (один выброс-час не сдвигает цену), веса — объём × спад по давности.
 * Запас стакана (lowest/highest_stock) — только на размер ордера: на бэктесте он цену не уточнил.
 */
export function realPrices(ph: readonly PairHour[], lastHour: number, window = 24): RealPrices | null {
  const from = lastHour - (window - 1) * 3600
  const hs = ph.filter((h) => h.hour >= from && h.hour <= lastHour && h.volX > 0 && h.volBase > 0)
  const w = (h: PairHour): number => h.volX * 0.5 ** ((lastHour - h.hour) / 3600 / RECENT_HALF_LIFE)
  const wx = hs.reduce((s, h) => s + w(h), 0)
  if (!(wx > 0)) return null
  const mid = hs.reduce((s, h) => s + (h.volBase / h.volX) * w(h), 0) / wx
  const ask = Math.max(mid, weightedMedian(hs.map((h) => ({ v: h.hi, w: w(h) }))))
  const bid = Math.min(mid, weightedMedian(hs.map((h) => ({ v: h.lo, w: w(h) }))) || mid)
  return {
    mid,
    buy: { at: mid + REAL_PUSH * (ask - mid), lo: mid, hi: ask },
    sell: { at: mid - REAL_PUSH * (mid - bid), lo: bid, hi: mid }
  }
}

/**
 * Все пары лиги за один проход: предмет → база → часы пары (от старых к новым). Сама база и вторая база
 * предметом не считаются (рынок chaos↔divine — у трекера курса).
 */
export function indexPairs(hours: readonly FullHour[], league: string): Map<string, Partial<Record<FlipBase, PairHour[]>>> {
  const out = new Map<string, Partial<Record<FlipBase, PairHour[]>>>()
  const skip = new Set([BASE_ID.chaos, BASE_ID.divine])
  for (const h of hours) {
    for (const m of h.markets) {
      if (m[0] !== league) continue
      for (const base of ['chaos', 'divine'] as const) {
        const b = BASE_ID[base]
        const item = m[1] === b ? m[2] : m[2] === b ? m[1] : null
        if (!item || skip.has(item)) continue
        const p = normalizeMarket(m, h.hour, item, base)
        if (!p) continue
        let e = out.get(item)
        if (!e) out.set(item, (e = {}))
        ;(e[base] ??= []).push(p)
      }
    }
  }
  for (const e of out.values()) for (const list of Object.values(e)) list?.sort((x, y) => x.hour - y.hour)
  return out
}

/** Все предметы, у которых есть рынок с этой базой (кроме самой базы и второй базы). */
export function itemsWithBase(hours: readonly FullHour[], league: string, base: FlipBase): Set<string> {
  const b = BASE_ID[base]
  const skip = new Set([BASE_ID.chaos, BASE_ID.divine])
  const out = new Set<string>()
  for (const h of hours) {
    for (const m of h.markets) {
      if (m[0] !== league) continue
      if (m[1] === b && !skip.has(m[2])) out.add(m[2])
      else if (m[2] === b && !skip.has(m[1])) out.add(m[1])
    }
  }
  return out
}
