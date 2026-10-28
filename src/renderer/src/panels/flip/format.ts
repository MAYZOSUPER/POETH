// Форматирование вкладки «Обмен» (S13): цены, проценты, время, подписи маршрутов.

import type { FlipBase, FlipRoute, FlipRouteKind, WealthItemNs } from '@shared/types'

const locale = (lang: string): string => (lang === 'ru' ? 'ru-RU' : 'en-US')

/** Число: ≥ 100 — целое, ≥ 1 — до десятых, меньше — до тысячных. */
export function num(v: number, lang: string): string {
  const a = Math.abs(v)
  const d = a >= 100 ? 0 : a >= 1 ? 1 : 3
  return v.toLocaleString(locale(lang), { maximumFractionDigits: d, minimumFractionDigits: 0 })
}

/** Число с фиксированными знаками после запятой (курс, коридор). */
export function fixed(v: number, digits: number, lang: string): string {
  return v.toLocaleString(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

/** Целое с разрядами (количества, золото); минус — типографский. */
export function int(v: number, lang: string): string {
  const s = Math.round(Math.abs(v)).toLocaleString(locale(lang))
  return v < 0 ? `−${s}` : s
}

/** Цена штуки: от 100 — целое, меньше — три значащие цифры (0,0833 div; 1,38 c). */
export function price(v: number, lang: string): string {
  if (Math.abs(v) >= 100) return int(v, lang)
  return Number(v.toPrecision(3)).toLocaleString(locale(lang), { maximumFractionDigits: 6 })
}

export function pct(v: number, lang: string): string {
  return `${(v * 100).toLocaleString(locale(lang), { maximumFractionDigits: 1 })}%`
}

export const UNIT: Record<FlipBase, string> = { chaos: 'c', divine: 'div' }

export const KIND_LABEL: Record<FlipRouteKind, string> = {
  CXC: 'C → X → C',
  DXD: 'D → X → D',
  CXD: 'C → X → D',
  DXC: 'D → X → C'
}

/** Пространство имён предмета фида — для русского имени по данным APT. */
export function itemNs(route: FlipRoute): WealthItemNs {
  return route.item.startsWith('DivinationCards/') ? 'DIVINATION_CARD' : 'ITEM'
}

/** Золото на весь флип (размер × золото за штуку). */
export function goldTotal(r: FlipRoute): number {
  return Math.round(r.goldPerUnit * r.units)
}

/** «14:00» — местное время часа фида (24 часа и в EN, как в макете). */
export function clock(ms: number, lang: string): string {
  return new Date(ms).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}
