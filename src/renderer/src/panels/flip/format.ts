// Форматирование вкладки «Обмен» (S13): цены, ордера, уверенность.

import type { FlipBase, FlipRoute, FlipRouteKind, WealthItemNs } from '@shared/types'

const locale = (lang: string): string => (lang === 'ru' ? 'ru-RU' : 'en-US')

/** Число: ≥ 100 — целое, ≥ 1 — до десятых, меньше — до тысячных. */
export function num(v: number, lang: string): string {
  const a = Math.abs(v)
  const d = a >= 100 ? 0 : a >= 1 ? 1 : 3
  return v.toLocaleString(locale(lang), { maximumFractionDigits: d, minimumFractionDigits: 0 })
}

export function pct(v: number, lang: string): string {
  return `${(v * 100).toLocaleString(locale(lang), { maximumFractionDigits: 1 })}%`
}

/** «●●○» — три деления уверенности. */
export function pips(confidence: number): number {
  return confidence >= 0.75 ? 3 : confidence >= 0.5 ? 2 : 1
}

export const KIND_LABEL: Record<FlipRouteKind, string> = {
  CXC: 'C → X → C',
  DXD: 'D → X → D',
  CXD: 'C → X → D',
  DXC: 'D → X → C'
}

export function baseKey(b: FlipBase): string {
  return b === 'chaos' ? 'flip.base.chaos' : 'flip.base.divine'
}

/** Пространство имён предмета фида — для русского имени по данным APT. */
export function itemNs(route: FlipRoute): WealthItemNs {
  return route.item.startsWith('DivinationCards/') ? 'DIVINATION_CARD' : 'ITEM'
}

/** Золото на весь флип (размер ордера × золото за штуку). */
export function goldTotal(r: FlipRoute): number {
  return Math.round(r.goldPerUnit * r.units)
}
