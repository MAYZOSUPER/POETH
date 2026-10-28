// Вид вкладки «Что фармить» (S16; чистые функции, tests/advisor/view.test.ts): строки карточек с доходом в час
// по времени карты из трекера, сортировка, кнопка сессии фарма, сравнение «оценка / мой результат», числа.

import type {
  AdvisorItemRef,
  AdvisorMapTime,
  AdvisorMyResult,
  AdvisorStrategyView,
  WealthItemNs
} from '@shared/types'
import type { FarmState } from '@shared/types/farm'
import { mapTime, myResult, perHour } from '@shared/advisor/time'

export type AdvisorSort = 'profit' | 'easy'

export interface AdvisorView {
  sort: AdvisorSort
  /** «Только лёгкие» — сложность 1 */
  easyOnly: boolean
}

export const DEFAULT_ADVISOR_VIEW: AdvisorView = { sort: 'profit', easyOnly: false }

export interface AdvisorRow extends AdvisorStrategyView {
  time: AdvisorMapTime | null
  /** chaos в час; null — прибыли нет или время карты неизвестно */
  perHour: number | null
  mine: AdvisorMyResult | null
}

/** Карточки: доход в час по времени из трекера, «Только лёгкие», сортировка (без дохода — в конце). */
export function buildRows(
  views: readonly AdvisorStrategyView[],
  farm: FarmState | null,
  view: AdvisorView
): AdvisorRow[] {
  const rows = views
    .filter((v) => !view.easyOnly || v.strategy.difficulty === 1)
    .map((v): AdvisorRow => {
      const time = mapTime(v.strategy.id, farm, v.strategy.minutesPerMap)
      return { ...v, time, perHour: perHour(v.estimate.profit, time?.minutes), mine: myResult(v.strategy.id, farm) }
    })
  const income = (r: AdvisorRow): number => r.perHour ?? Number.NEGATIVE_INFINITY
  return rows.sort((a, b) =>
    view.sort === 'easy'
      ? a.strategy.difficulty - b.strategy.difficulty || income(b) - income(a)
      : income(b) - income(a) || a.strategy.difficulty - b.strategy.difficulty
  )
}

/** Кнопка сессии фарма: start — сессии нет; tag — идёт без метки или с другой; running — уже с этой. */
export type FarmButton = 'start' | 'tag' | 'running'

export function farmButton(strategyId: string, farm: FarmState | null): FarmButton {
  if (!farm?.session) return 'start'
  return farm.session.strategy === strategyId ? 'running' : 'tag'
}

/** Мой результат против оценки: в пределах ±25% — «около оценки». */
export function versus(mine: number | null, estimate: number | null): 'above' | 'near' | 'below' | null {
  if (mine === null || estimate === null || !(Math.abs(estimate) > 0)) return null
  const k = mine / estimate
  if (estimate < 0) return mine >= estimate ? 'above' : 'below'
  return k > 1.25 ? 'above' : k < 0.75 ? 'below' : 'near'
}

/** Пространство имён предмета — для русского имени по данным APT. */
export function itemNs(ref: AdvisorItemRef): WealthItemNs {
  switch (ref.kind) {
    case 'card':
      return 'DIVINATION_CARD'
    case 'unique':
      return 'UNIQUE'
    case 'gem':
      return 'GEM'
    default:
      return 'ITEM'
  }
}

/** Текст стратегии на языке интерфейса. */
export { tx } from '@shared/advisor/data'

const locale = (lang: string): string => (lang === 'ru' ? 'ru-RU' : 'en-US')

/** Сумма в chaos: от 10 — целое, меньше — до десятых (до сотых — меньше 1); минус — типографский. */
export function chaosText(v: number, lang: string): string {
  const a = Math.abs(v)
  const digits = a >= 10 ? 0 : a >= 1 ? 1 : 2
  const s = a.toLocaleString(locale(lang), { maximumFractionDigits: digits })
  return v < 0 ? `−${s}` : s
}

/** Количество за карту: целое — как есть, дробное — до сотых. */
export function qtyText(v: number, lang: string): string {
  return v.toLocaleString(locale(lang), { maximumFractionDigits: 2 })
}

/** Минуты на карту: до десятых. */
export function minutesText(v: number, lang: string): string {
  return v.toLocaleString(locale(lang), { maximumFractionDigits: 1 })
}

/** Время сессий: часы и минуты. */
export function hm(ms: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(ms / 60_000))
  return { h: Math.floor(total / 60), m: total % 60 }
}
