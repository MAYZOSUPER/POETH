// Фарм в час и стоимость на момент времени (чистый модуль; tests/wealth/farm.test.ts).
//
// Доход сессии = стоимость последнего снимка сессии − стоимость снимка «Начать»;
// в час = доход / часы между этими снимками. «За последний час» — разница с точкой
// час назад (линейная интерполяция между снимками). Короче 5 минут — «в час» не считаем:
// одна находка дала бы бессмысленные тысячи в час.

import type { FarmSession, FarmView, WealthPoint } from '../types/wealth'

export const MIN_RATE_SPAN_MS = 5 * 60_000
const HOUR_MS = 3_600_000

/** Точки, отсортированные по времени (копия). */
export function sortPoints(points: readonly WealthPoint[]): WealthPoint[] {
  return [...points].sort((a, b) => a.at - b.at)
}

/**
 * Стоимость (chaos) на момент `at` по точкам: точное совпадение, иначе линейная интерполяция
 * между соседними. До первой точки и после последней — null (не экстраполируем), кроме
 * `at` после последней точки при `holdLast` (стоимость «сейчас» = последний снимок).
 */
export function netWorthAt(points: readonly WealthPoint[], at: number, holdLast = false): number | null {
  const p = sortPoints(points)
  if (!p.length || at < p[0].at) return null
  const last = p[p.length - 1]
  if (at >= last.at) return at === last.at || holdLast ? last.chaos : null
  for (let i = 1; i < p.length; i++) {
    const b = p[i]
    if (at > b.at) continue
    const a = p[i - 1]
    if (b.at === a.at) return b.chaos
    const t = (at - a.at) / (b.at - a.at)
    return a.chaos + (b.chaos - a.chaos) * t
  }
  return last.chaos
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Доход в час (chaos/ч) между двумя точками; null — слишком коротко. */
export function ratePerHour(from: WealthPoint, to: WealthPoint): number | null {
  const span = to.at - from.at
  if (span < MIN_RATE_SPAN_MS) return null
  return round2(((to.chaos - from.chaos) * HOUR_MS) / span)
}

/**
 * Состояние фарма по сессии и точкам лиги. Точки сессии — от снимка «Начать» до «Стоп»
 * (или до последнего, если сессия идёт).
 */
export function farmView(session: FarmSession | null, points: readonly WealthPoint[]): FarmView {
  if (!session) return { session: null, snapshots: 0 }
  const end = session.stoppedAt ?? Infinity
  const inSession = sortPoints(points).filter((p) => p.at >= session.startedAt && p.at <= end)
  const start: WealthPoint = { at: session.startedAt, chaos: session.startChaos, divineRate: 0 }
  const lastPoint = inSession[inSession.length - 1]
  const view: FarmView = { session, snapshots: inSession.length }
  if (!lastPoint || lastPoint.at <= start.at) {
    view.gain = 0
    view.lastHour = null
    return view
  }
  view.gain = round2(lastPoint.chaos - start.chaos)
  const rate = ratePerHour(start, lastPoint)
  if (rate !== null) view.perHour = rate
  // за последний час: если сессия короче часа — от начала сессии
  const hourAgo = lastPoint.at - HOUR_MS
  const base = hourAgo <= start.at ? start.chaos : netWorthAt([start, ...inSession], hourAgo)
  view.lastHour = base === null || lastPoint.at - start.at < MIN_RATE_SPAN_MS ? null : round2(lastPoint.chaos - base)
  return view
}

/** Начать сессию со снимка `id` стоимостью `chaos`. */
export function startSession(league: string, at: number, id: string, chaos: number): FarmSession {
  return { league, startedAt: at, startId: id, startChaos: chaos }
}

/** Остановить сессию на снимке `id`. */
export function stopSession(s: FarmSession, at: number, id: string, chaos: number): FarmSession {
  return { ...s, stoppedAt: at, endId: id, endChaos: chaos }
}
