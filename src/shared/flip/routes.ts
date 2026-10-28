// Маршруты флипа C→X→C, D→X→D, C→X→D, D→X→C по статистике пар (чистый модуль; tests/flip/routes.test.ts).
//
// Покупка X — по нижней границе (lo) рынка покупки, продажа — по верхней (hi) рынка продажи (оценка по прошлым
// часам, не live). Прибыль — в chaos; комиссия биржи — в золоте за каждую купленную единицу (сначала X, потом
// валюта, которую получаем при продаже), поэтому отдельно «прибыль на 1000 золота»: продавать в divine дешевле
// по золоту, чем в chaos. Размер ордера — целые «делящиеся» соотношения; не больше 1/5 глубины стакана.

import type { FlipBase, FlipFilters, FlipLeg, FlipReject, FlipRoute, FlipRouteKind } from '../types/flip'
import type { FullHour } from './feed'
import { indexPairs, pairStats, type PairStats } from './stats'

export const DEFAULT_FILTERS: FlipFilters = {
  minLiquidityDiv: 2,
  minActiveHours: 18,
  minSpread: 0.03,
  maxSpread: 0.25,
  maxVolatility: 0.25,
  depthMultiple: 5,
  maxTrend: 0.1,
  budgetDiv: 10
}

/** Faustus держит не больше 10 ордеров — это 5 флипов (покупка + продажа). */
export const MAX_ORDERS = 10
export const MAX_FLIPS = MAX_ORDERS / 2
/** Доля часового объёма, которую реально занять за час своим ордером. */
const HOURLY_SHARE = 0.1
const MAX_DEN = 50

export interface RatioOrder {
  /** штук базы */
  m: number
  /** штук X */
  n: number
}

/**
 * Целое соотношение m базы : n штук X для цены `price` (базы за штуку): покупка — не дороже цены (m/n ≤ price),
 * продажа — не дешевле (m/n ≥ price). Наименьшее n, при котором ошибка ≤ 0,5 %, иначе самое точное из n ≤ 50.
 */
export function ratioOrder(price: number, side: 'buy' | 'sell', maxDen = MAX_DEN): RatioOrder | null {
  if (!(price > 0)) return null
  let best: (RatioOrder & { err: number }) | null = null
  for (let n = 1; n <= maxDen; n++) {
    const m = side === 'buy' ? Math.floor(n * price + 1e-9) : Math.ceil(n * price - 1e-9)
    if (m < 1) continue
    const err = Math.abs(m / n - price) / price
    if (!best || err < best.err - 1e-12) best = { m, n, err }
    if (err <= 0.005) break
  }
  return best ? { m: best.m, n: best.n } : null
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a
}
export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b
}

export interface RouteContext {
  /** chaos за 1 divine */
  rate: number
  /** id фида → английское имя */
  names: Readonly<Record<string, string>>
  /** английское имя → золото за купленную штуку */
  fees: Readonly<Record<string, number>>
  filters: FlipFilters
}

interface Market {
  base: FlipBase
  s24: PairStats
  s6: PairStats
}

const KINDS: Array<[FlipRouteKind, FlipBase, FlipBase]> = [
  ['CXC', 'chaos', 'chaos'],
  ['DXD', 'divine', 'divine'],
  ['CXD', 'chaos', 'divine'],
  ['DXC', 'divine', 'chaos']
]

const BASE_NAME: Record<FlipBase, string> = { chaos: 'Chaos Orb', divine: 'Divine Orb' }

const round = (v: number, d = 2): number => {
  const k = 10 ** d
  return Math.round(v * k) / k
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

function trendOf(m: Market): number {
  return m.s24.vwap > 0 && m.s6.vwap > 0 ? m.s6.vwap / m.s24.vwap - 1 : 0
}

/** Маршрут по двум рынкам предмета. */
export function buildRoute(kind: FlipRouteKind, item: string, buyM: Market, sellM: Market, ctx: RouteContext): FlipRoute | null {
  const name = ctx.names[item]
  if (!name) return null
  const chaosOf = (b: FlipBase): number => (b === 'chaos' ? 1 : ctx.rate)
  const buyPrice = buyM.s24.lo
  const sellPrice = sellM.s24.hi
  const buyOrder = ratioOrder(buyPrice, 'buy')
  const sellOrder = ratioOrder(sellPrice, 'sell')
  if (!buyOrder || !sellOrder || !(ctx.rate > 0)) return null
  // цены — как в целых ордерах (ровно то, что выставит игрок)
  const buyEff = buyOrder.m / buyOrder.n
  const sellEff = sellOrder.m / sellOrder.n
  const buyChaos = buyEff * chaosOf(buyM.base)
  const sellChaos = sellEff * chaosOf(sellM.base)
  const profit = sellChaos - buyChaos
  const feeX = ctx.fees[name] ?? 0
  const goldPerUnit = feeX + sellEff * (ctx.fees[BASE_NAME[sellM.base]] ?? 0)

  const f = ctx.filters
  const same = buyM === sellM
  const liquidity = Math.min(buyM.s24.liquidity, sellM.s24.liquidity)
  const activeHours = Math.min(buyM.s24.activeHours, sellM.s24.activeHours)
  const volatility = Math.max(buyM.s24.volatility, sellM.s24.volatility)
  const spread = same ? buyM.s24.spread : buyChaos > 0 ? profit / buyChaos : 0
  const trend = Math.abs(trendOf(buyM)) >= Math.abs(trendOf(sellM)) ? trendOf(buyM) : trendOf(sellM)

  // размер: кратно обоим ордерам, не больше 1/depthMultiple глубины и часового объёма тонкой ноги
  const step = lcm(buyOrder.n, sellOrder.n)
  const depthCap = Math.min(buyM.s24.depth, sellM.s24.depth) / f.depthMultiple
  const hourlyVol = Math.min(buyM.s24.volume, sellM.s24.volume) / 24
  const budgetCap = buyChaos > 0 ? (f.budgetDiv * ctx.rate) / buyChaos : 0
  const cap = Math.min(depthCap, Math.max(hourlyVol, step), budgetCap)
  const units = cap >= step ? Math.floor(cap / step) * step : 0
  const perHour = units > 0 ? profit * Math.min(units, Math.max(HOURLY_SHARE * hourlyVol, 1)) : 0

  const rejects: FlipReject[] = []
  if (liquidity < f.minLiquidityDiv * ctx.rate) rejects.push('liquidity')
  if (activeHours < f.minActiveHours) rejects.push('activity')
  if (spread < f.minSpread || spread > f.maxSpread) rejects.push('spread')
  if (volatility > f.maxVolatility) rejects.push('volatility')
  if (budgetCap < step) rejects.push('budget')
  else if (units < 1) rejects.push('depth')
  if (Math.abs(trend) > f.maxTrend) rejects.push('trend')
  if (!(profit > 0)) rejects.push('profit')

  // уверенность: активность, ликвидность, спокойствие цены, устойчивость спреда, отсутствие тренда
  const act = activeHours / 24
  const liq = Math.sqrt(clamp01(liquidity / (5 * f.minLiquidityDiv * ctx.rate)))
  const calm = clamp01(1 - volatility / f.maxVolatility)
  const s6 = same ? buyM.s6.spread : spread
  const stab = same && buyM.s24.spread > 0 ? clamp01(1 - Math.abs(s6 / buyM.s24.spread - 1)) : 0.5
  const flat = clamp01(1 - Math.abs(trend) / f.maxTrend)
  const confidence = round(0.3 * act + 0.2 * liq + 0.2 * calm + 0.15 * stab + 0.15 * flat)

  const leg = (base: FlipBase, price: number, give: number, get: number): FlipLeg => ({ base, price: round(price, 4), order: { give, get } })
  return {
    id: `${kind}:${item}`,
    kind,
    item,
    name,
    buy: leg(buyM.base, buyEff, buyOrder.m, buyOrder.n),
    sell: leg(sellM.base, sellEff, sellOrder.n, sellOrder.m),
    profit: round(profit, 3),
    roi: round(buyChaos > 0 ? profit / buyChaos : 0, 4),
    goldPerUnit: round(goldPerUnit, 1),
    per1000Gold: round(goldPerUnit > 0 ? (profit / goldPerUnit) * 1000 : 0, 2),
    units,
    perHour: round(perHour, 1),
    confidence,
    liquidity: round(liquidity, 1),
    activeHours,
    volatility: round(volatility, 3),
    spread: round(spread, 4),
    trend: round(trend, 4),
    rejects
  }
}

export interface ComputeInput {
  hours: readonly FullHour[]
  league: string
  /** последний час фида (секунды) */
  lastHour: number
  ctx: RouteContext
}

/** Все маршруты лиги: прошедшие фильтры (лучшие сверху) и отсеянные (с причинами). */
export function computeRoutes(input: ComputeInput): { routes: FlipRoute[]; rejected: FlipRoute[] } {
  const { hours, league, lastHour, ctx } = input
  const routes: FlipRoute[] = []
  const rejected: FlipRoute[] = []
  for (const [item, pairs] of indexPairs(hours, league)) {
    const markets: Partial<Record<FlipBase, Market>> = {}
    for (const base of ['chaos', 'divine'] as const) {
      const ph = pairs[base]
      if (!ph?.length) continue
      const bc = base === 'chaos' ? 1 : ctx.rate
      const s24 = pairStats(ph, lastHour, 24, bc)
      if (!(s24.lo > 0 && s24.hi > 0)) continue
      markets[base] = { base, s24, s6: pairStats(ph, lastHour, 6, bc) }
    }
    for (const [kind, b1, b2] of KINDS) {
      const m1 = markets[b1]
      const m2 = markets[b2]
      if (!m1 || !m2) continue
      const r = buildRoute(kind, item, m1, m2, ctx)
      if (!r) continue
      if (r.rejects.length) rejected.push(r)
      else routes.push(r)
    }
  }
  const score = (r: FlipRoute): number => r.confidence * r.perHour
  routes.sort((a, b) => score(b) - score(a))
  rejected.sort((a, b) => b.perHour - a.perHour)
  return { routes, rejected }
}

/**
 * Лучшие флипы на одновременное исполнение: разные предметы, не больше MAX_FLIPS (= 10 ордеров); маршруты с
 * трендом — только если `withTrend` (чип «Без тренда» выключен).
 */
export function topFlips(routes: readonly FlipRoute[], limit = MAX_FLIPS, withTrend = false): FlipRoute[] {
  const seen = new Set<string>()
  const out: FlipRoute[] = []
  for (const r of routes) {
    if (seen.has(r.item)) continue
    if (!withTrend && r.rejects.includes('trend')) continue
    seen.add(r.item)
    out.push(r)
    if (out.length >= limit) break
  }
  return out
}
