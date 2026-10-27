import type { UiLang } from '@shared/types'
import type { StatFilter } from '@shared/poe1/pricecheck'

// Форматирование для окна цены PoE1: числа (RU — запятая), валюта, возраст лота, текст мода с числом.

export function fmtNum(v: number, lang: UiLang): string {
  const s = String(Math.round(v * 100) / 100)
  return lang === 'ru' ? s.replace('.', ',') : s
}

const CURRENCY_SHORT: Record<string, string> = {
  divine: 'div',
  chaos: 'chaos',
  exalted: 'ex',
  mirror: 'mirror',
  'mirror-shard': 'shard',
  'chaos-shard': 'chaos shard'
}

export function currencyLabel(currency: string): string {
  return CURRENCY_SHORT[currency] ?? currency
}

export function coinClass(currency: string): string {
  if (currency === 'divine') return 'ui-coin ui-coin--div'
  if (currency === 'chaos') return 'ui-coin ui-coin--chaos'
  if (currency === 'exalted') return 'ui-coin ui-coin--ex'
  return 'ui-coin'
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

/** Текст фильтра частями: [до #, число, после #]; без # или с несколькими # — как есть + число отдельно. */
export function statParts(f: StatFilter, lang: UiLang): { before: string; value?: string; after: string } {
  const text = f.text
  const value = f.roll ? fmtNum(f.roll.value, lang) : undefined
  const first = text.indexOf('#')
  if (first === -1 || value === undefined) return { before: text.replace(/#/g, '…'), after: '' }
  if (text.indexOf('#', first + 1) !== -1) return { before: text.replace(/#/g, '…') + ' · ', value, after: '' }
  return { before: text.slice(0, first), value, after: text.slice(first + 1) }
}

/** T1 → лучший … T4+ → низкий */
export function tierWordKey(tier: number): string {
  return `pc1.tier.${Math.min(Math.max(tier, 1), 4)}`
}
