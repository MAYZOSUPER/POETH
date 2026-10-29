// Вид вкладки «Обмен» по макету v2 (чистые функции; tests/flip/view.test.ts): фильтры простого режима поверх
// маршрутов из main, сортировка по заголовкам, размер ордеров у Фаустуса, ряд курса divine для графика.

import type { DivineTrack, FlipBase, FlipRoute } from '@shared/types'

export type ViewBase = FlipBase | 'all'
export type ViewSort = 'perHour' | 'perGold'
export type RateRange = '24h' | '7d'

export interface FlipView {
  /** «За chaos» / «За divine» — чем платим за покупку */
  base: ViewBase
  /** «Только надёжные» — уверенность ●● и выше */
  sure: boolean
  /** «Без тренда» (включён по умолчанию) — скрыть отсеянные только трендом */
  noTrend: boolean
  q: string
  sort: ViewSort
}

export const DEFAULT_VIEW: FlipView = { base: 'chaos', sure: false, noTrend: true, q: '', sort: 'perHour' }

const HOUR = 3_600_000

/** Деления уверенности ●●○: 3 — высокая, 2 — средняя, 1 — низкая. */
export function pips(confidence: number): 1 | 2 | 3 {
  return confidence >= 0.75 ? 3 : confidence >= 0.5 ? 2 : 1
}

export const isTrend = (r: FlipRoute): boolean => r.rejects.includes('trend')

const ofBase = (r: FlipRoute, base: ViewBase): boolean => base === 'all' || r.buy.base === base

/** Строки таблицы: база, надёжность, тренд, поиск (по имени на языке интерфейса и английскому), сортировка. */
export function visibleRoutes(routes: readonly FlipRoute[], v: FlipView, nameOf: (r: FlipRoute) => string): FlipRoute[] {
  const q = v.q.trim().toLowerCase()
  const out = routes.filter(
    (r) =>
      ofBase(r, v.base) &&
      (!v.sure || pips(r.confidence) >= 2) &&
      (!v.noTrend || !isTrend(r)) &&
      (!q || `${nameOf(r)} ${r.name}`.toLowerCase().includes(q))
  )
  const key = (r: FlipRoute): number => (v.sort === 'perGold' ? r.per1000Gold : r.perHour)
  return out.sort((a, b) => key(b) - key(a))
}

/** Сколько строк выбранной базы скрыл чип «Без тренда». */
export function hiddenByTrend(routes: readonly FlipRoute[], v: FlipView): number {
  return v.noTrend ? routes.filter((r) => isTrend(r) && ofBase(r, v.base)).length : 0
}

/** Выбранная строка: прежняя, если она видна, иначе первая. */
export function pickRoute(rows: readonly FlipRoute[], id: string | null): FlipRoute | null {
  return rows.find((r) => r.id === id) ?? rows[0] ?? null
}

export interface OrderTotals {
  /** покупка: отдать столько базы … */
  buyGive: number
  /** … получить столько штук X (= units) */
  units: number
  /** продажа: отдать units штук X, получить столько базы */
  sellGet: number
}

/** Целые числа для окна обмена: размер флипа кратен обоим ордерам, поэтому всё делится нацело. */
export function orderTotals(r: FlipRoute): OrderTotals {
  return {
    buyGive: Math.round((r.units / r.buy.order.get) * r.buy.order.give),
    units: r.units,
    sellGet: Math.round((r.units / r.sell.order.give) * r.sell.order.get)
  }
}

/**
 * Сколько ждать исполнения покупки по модели маршрута (perHour = прибыль × штук в час): null — в пределах часа,
 * иначе часы (до половины часа).
 */
export function fillHours(r: FlipRoute): number | null {
  if (!(r.profit > 0) || !(r.perHour > 0) || !(r.units > 0)) return null
  const perHour = r.perHour / r.profit
  if (perHour >= r.units * 0.999) return null
  return Math.max(1, Math.round((r.units / perHour) * 2) / 2)
}

/** Нога флипа: покупка (Хочу X : Имею базу) или продажа (Хочу базу : Имею X). */
export type GameSide = 'buy' | 'sell'

/** Ключ «цены из игры» на время сессии: одна и та же покупка Valdo за chaos — у C→X→C и C→X→D. */
export function gameKey(r: FlipRoute, side: GameSide): string {
  return `${side}:${r.item}:${r[side].base}`
}

/**
 * «Рыночный курс» из игры → цена штуки X в базе. В игре курс «Хочу : Имею»: покупка «1:296» (хочу 1 X, имею
 * 296 chaos) → 296; продажа «1:1,04» (хочу 1 div, имею 1,04 X) → 0,96. Одно число — «1 : число», «<1:318» из
 * стакана тоже понимаем. Если так прочитанная цена в разы дальше от оценки, чем обратная, — игрок записал курс
 * наоборот (455 вместо 455 : 1): берём обратную. null — не число.
 */
export function parseGameRatio(text: string, side: GameSide, estimate: number): number | null {
  const s = text.trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/^[<≈~]/, '')
  const m = /^(\d*\.?\d+)(?:[:/](\d*\.?\d+))?$/.exec(s)
  if (!m) return null
  const want = m[2] === undefined ? 1 : Number(m[1])
  const have = Number(m[2] ?? m[1])
  if (!(want > 0 && have > 0 && Number.isFinite(want) && Number.isFinite(have))) return null
  const p = side === 'buy' ? have / want : want / have
  if (!(estimate > 0)) return p
  const off = (v: number): number => Math.abs(Math.log(v / estimate))
  return off(p) > Math.log(1.5) && off(1 / p) < off(p) ? 1 / p : p
}

/** Курс «Хочу : Имею» для цены штуки X — как его покажет игра (подсказка в поле ввода). */
export function gameRatio(price: number, side: GameSide): { want: number; have: number } {
  // покупка: хочу 1 X : имею price базы; продажа: хочу price базы : имею 1 X — меньшая сторона = 1
  const [want, have] = side === 'buy' ? [1, price] : [price, 1]
  return want >= have ? { want: want / have, have: 1 } : { want: 1, have: have / want }
}

export type GameVerdict = 'good' | 'thin' | 'bad'

export interface GameCheck {
  /** цены, по которым считали (из игры или оценка), база за штуку */
  buy: number
  sell: number
  /** chaos со штуки, доходность, на весь флип, в час, на 1000 золота */
  profit: number
  roi: number
  total: number
  perHour: number
  per1000Gold: number
  /** выгодно — маржа не ниже порога спреда; на грани — в плюс, но тоньше порога; невыгодно — в минус */
  verdict: GameVerdict
}

/**
 * Пересчёт флипа по курсу, который игрок увидел в игре (null — наша оценка): прибыль со штуки по курсу divine,
 * золото — тем же составом (X + база при продаже), в час — через flow маршрута.
 */
export function gameCheck(r: FlipRoute, divine: number, buy: number | null, sell: number | null, minSpread: number): GameCheck {
  const b = buy ?? r.buy.price
  const s = sell ?? r.sell.price
  const chaosOf = (base: FlipBase): number => (base === 'chaos' ? 1 : divine)
  const cost = b * chaosOf(r.buy.base)
  const profit = s * chaosOf(r.sell.base) - cost
  const roi = cost > 0 ? profit / cost : 0
  const gold = r.gold.x + s * r.gold.base
  return {
    buy: b,
    sell: s,
    profit,
    roi,
    total: profit * r.units,
    perHour: profit * r.flow,
    per1000Gold: gold > 0 ? (profit / gold) * 1000 : 0,
    verdict: !(profit > 0) ? 'bad' : roi < minSpread ? 'thin' : 'good'
  }
}

/** Итог круга в chaos и, для D→X→D, в divine. */
export function roundProfit(r: FlipRoute, divine: number): { chaos: number; div: number | null } {
  const chaos = r.profit * r.units
  return { chaos, div: r.buy.base === 'divine' && r.sell.base === 'divine' && divine > 0 ? chaos / divine : null }
}

export interface RatePoint {
  at: number
  rate: number
}

export interface RateView {
  points: RatePoint[]
  /** начало окна (мс): ось X — время, «−24 ч … сейчас» */
  t0: number
  t1: number
  /** коридор мин–макс за окно без последнего часа (меньше 3 часов — нет) */
  lo: number | null
  hi: number | null
  /** последняя точка вне коридора окна (жёлтая точка и подпись) */
  outside: boolean
  /** последняя точка − первая */
  delta: number
}

/** Ряд курса divine за 24 ч или 7 дней по часам фида. */
export function rateView(d: DivineTrack, range: RateRange): RateView | null {
  if (!d.series.length) return null
  const t1 = d.series[d.series.length - 1].at
  const t0 = t1 - (range === '24h' ? 24 : 168) * HOUR
  const points = d.series.filter((p) => p.at >= t0)
  const before = points.slice(0, -1).map((p) => p.rate)
  const last = points[points.length - 1]
  const lo = before.length >= 3 ? Math.min(...before) : null
  const hi = before.length >= 3 ? Math.max(...before) : null
  return {
    points,
    t0,
    t1,
    lo,
    hi,
    outside: lo !== null && hi !== null && (last.rate > hi || last.rate < lo),
    delta: Math.round((last.rate - points[0].rate) * 100) / 100
  }
}

/** Шаг сетки 1-2-5 так, чтобы на шкале было не больше ~5 делений. */
export function niceStep(span: number, ticks = 4): number {
  const raw = Math.max(span, 1e-9) / ticks
  const p = 10 ** Math.floor(Math.log10(raw))
  for (const k of [1, 2, 5, 10]) if (k * p >= raw) return k * p
  return 10 * p
}

/** Часы назад от последней точки (для подсказки графика). */
export function hoursAgo(at: number, t1: number): number {
  return Math.round((t1 - at) / HOUR)
}
