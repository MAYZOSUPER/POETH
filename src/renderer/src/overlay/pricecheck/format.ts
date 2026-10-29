import type { UiLang } from '@shared/types'
import { currencyShort } from '@shared/currency'

// Форматирование для окна цены PoE1: числа (RU — запятая), валюта, возраст лота.

export function fmtNum(v: number, lang: UiLang): string {
  const s = String(Math.round(v * 100) / 100)
  return lang === 'ru' ? s.replace('.', ',') : s
}

/** Коротко для экспертного режима: div / c / ex (S18: общий список @shared/currency). */
export function currencyLabel(currency: string): string {
  return currencyShort(currency)
}

/** Возраст лота: ['pc1.age.m', {n}] и т.п. */
export function ageKey(indexed: string | undefined, now = Date.now()): [string, { n: number }] | null {
  if (!indexed) return null
  const t = Date.parse(indexed)
  if (Number.isNaN(t)) return null
  const min = Math.max(1, Math.round((now - t) / 60_000))
  if (min < 60) return ['pc1.age.m', { n: min }]
  const h = Math.round(min / 60)
  if (h < 48) return ['pc1.age.h', { n: h }]
  return ['pc1.age.d', { n: Math.round(h / 24) }]
}

/** Обратный отсчёт до повтора после лимита сайта: 45 → «0:45», 120 → «2:00». */
export function waitClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** T1 → лучший … T4+ → низкий */
export function tierWordKey(tier: number): string {
  return `pc1.tier.${Math.min(Math.max(tier, 1), 4)}`
}
