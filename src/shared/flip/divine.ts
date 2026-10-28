// Трекер курса divine:chaos по часам фида (чистый модуль; tests/flip/divine.test.ts). Единый источник курса:
// плашка курса в окне цены (S4, trade.currencyRate), учёт богатства (S11a) и флиппинг (S13).

import type { DivineTrack } from '../types/flip'
import type { FullHour } from './feed'
import { pairHours, pairStats } from './stats'
import { DIVINE_ID } from '../wealth/exchange'

const round = (v: number): number => Math.round(v * 100) / 100

/** Коридор мин–макс почасового курса (по макету «Обмен»); меньше 3 часов — нет коридора. */
function corridor(rates: number[]): { lo: number; hi: number } | null {
  if (rates.length < 3) return null
  return { lo: round(Math.min(...rates)), hi: round(Math.max(...rates)) }
}

/**
 * Курс divine в chaos: «сейчас» — VWAP за 6 ч (если сделок нет — за 24 и 48 ч, как у учёта богатства), почасовой
 * ряд, коридоры мин–макс за сутки и неделю ДО последнего часа и выход последнего часа из коридора недели
 * (новый недельный максимум/минимум — повод для уведомления). null — сделок chaos↔divine нет.
 */
export function divineTrack(hours: readonly FullHour[], league: string): DivineTrack | null {
  const ph = pairHours(hours, league, DIVINE_ID, 'chaos')
  const traded = ph.filter((h) => h.volX > 0 && h.volBase > 0)
  if (!traded.length) return null
  const lastHour = Math.max(...hours.map((h) => h.hour))
  let current = 0
  for (const w of [6, 24, 48]) {
    const s = pairStats(ph, lastHour, w, 1)
    if (s.vwap > 0) {
      current = s.vwap
      break
    }
  }
  if (!(current > 0)) current = traded[traded.length - 1].volBase / traded[traded.length - 1].volX
  const series = traded.map((h) => ({ at: h.hour * 1000, rate: round(h.volBase / h.volX) }))
  const last = series[series.length - 1]
  const dayFrom = (lastHour - 23 * 3600) * 1000
  const weekFrom = (lastHour - 167 * 3600) * 1000
  // коридор — по часам до последнего: иначе последний час всегда был бы внутри своего мин–макс
  const before = series.filter((p) => p.at < last.at)
  const day = corridor(before.filter((p) => p.at >= dayFrom).map((p) => p.rate))
  const week = corridor(before.filter((p) => p.at >= weekFrom).map((p) => p.rate))
  const outside = week && last.at === lastHour * 1000 ? (last.rate > week.hi ? 'above' : last.rate < week.lo ? 'below' : null) : null
  return { current: round(current), lastHour: last.rate, hour: last.at, day, week, outside, series: series.filter((p) => p.at >= weekFrom) }
}
