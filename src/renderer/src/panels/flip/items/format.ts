import { useCallback } from 'react'
import type { ItemRow, UiLang } from '@shared/types'
import { useNameOf } from '../../wealth/names'

// Форматирование «Предметов» (S33): цена в divine или chaos, имя уника на языке клиента игры.

const locale = (lang: string): string => (lang === 'ru' ? 'ru-RU' : 'en-US')

/** Цена: от 1 div — в divine (от 100 — целым, от 10 — до десятых, меньше — до сотых), дешевле — в chaos целым. */
export function money(chaos: number, divine: number, lang: string): { tag: 'chaos' | 'divine'; text: string } {
  if (divine > 0 && Math.abs(chaos) >= divine) {
    const d = chaos / divine
    const digits = Math.abs(d) >= 100 ? 0 : Math.abs(d) >= 10 ? 1 : 2
    return { tag: 'divine', text: d.toLocaleString(locale(lang), { maximumFractionDigits: digits }) }
  }
  const c = Math.round(chaos)
  return { tag: 'chaos', text: c.toLocaleString(locale(lang)) }
}

/** «+12» / «−3» с типографским минусом. */
export function signed(text: string, v: number): string {
  return v < 0 ? `−${text.replace(/^-/, '')}` : `+${text}`
}

export function pctText(v: number, lang: string): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString(locale(lang), { maximumFractionDigits: 0 })}%`
}

export function daysText(d: number, lang: string): string {
  return d.toLocaleString(locale(lang), { maximumFractionDigits: d < 1 ? 1 : 0 })
}

/**
 * Имя уника на языке клиента игры (S26): английское — как у poe.ninja, русское — по данным APT. Foulborn —
 * отдельной меткой (в RU-клиенте приставка склоняется по роду — не угадываем).
 */
export function useUniqueName(lang: UiLang): (row: Pick<ItemRow, 'name'>) => string {
  const nameOf = useNameOf(lang)
  return useCallback((row: Pick<ItemRow, 'name'>) => nameOf({ name: row.name, ns: 'UNIQUE' }), [nameOf])
}

/** База уника на языке клиента игры («Heavy Belt» → «Тяжёлый пояс»). */
export function useBaseName(lang: UiLang): (base: string) => string {
  const nameOf = useNameOf(lang)
  return useCallback((base: string) => nameOf({ name: base, ns: 'ITEM' }), [nameOf])
}
