// Общие помощники строки поиска: лимит, экранирование, кавычки, подсказка при переполнении.

import type { OverflowItem } from '../types/regex'

/** Лимит длины строки поиска в игре. */
export const REGEX_LIMIT = 250

const REGEX_SPECIAL = /[\\^$.|?*+()[\]{}]/g

export function escapeRegex(s: string): string {
  return s.replace(REGEX_SPECIAL, '\\$&')
}

/** ё и е в поиске игры могут не различаться — проверки уникальности делаем «со свёрткой». */
export function foldYo(s: string): string {
  return s.replace(/ё/g, 'е')
}

export interface Term {
  negate: boolean
  body: string
}

/** Терм → текст: "!a|b" для НЕ, кавычки — если есть пробел или |. */
export function formatTerm(t: Term): string {
  if (t.negate) return `"!${t.body}"`
  return /[ |]/.test(t.body) ? `"${t.body}"` : t.body
}

export function joinTerms(terms: Term[]): string {
  return terms
    .filter((t) => t.body)
    .map(formatTerm)
    .join(' ')
}

/** Что убрать, чтобы влезть в лимит: самые «дорогие» пункты, пока не наберём `by` символов. */
export function suggestRemovals(items: OverflowItem[], by: number): OverflowItem[] {
  const sorted = [...items].sort((a, b) => b.saves - a.saves)
  const out: OverflowItem[] = []
  let saved = 0
  for (const it of sorted) {
    if (saved >= by) break
    out.push(it)
    saved += it.saves
  }
  return out
}
