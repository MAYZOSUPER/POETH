// Общие куски строк поиска PoE 2 (S62): моды «не хочу / хочу», редкость, тир, пороги.
//
// С 0.5.0 поиск игры идёт по расширенному тексту предмета (патчноут 0.5.0) — у числа в строке мода стоит
// диапазон тира («+25(21-25)%»), поэтому порог по строке мода — <pre><atLeast(N, \d)>(\(.+\))?<post>, а не «.»:
// с «.» atLeast схватил бы скобку диапазона («5)%»). Свойства путевого камня («Pack Size: +20%») без диапазона.

import type { OverflowItem, Poe2ModData, Poe2Rarity, TriState } from '../../types/regex'
import { atLeast } from '../atLeast'
import { coverMods, getModIndex } from '../cover'
import type { Term } from '../format'

export const POE2_RARITIES: readonly Poe2Rarity[] = ['normal', 'magic', 'rare', 'unique']

/** Необязательный диапазон тира после числа в расширенном тексте: «25(21-25)». */
export const RANGE_RE = '(\\(.+\\))?'

/** Мод можно выбрать: в RU у него есть русский текст. */
export const selectable = (m: Poe2ModData): boolean => !m.tags.includes('noRu')

interface ModsInput {
  mods: Poe2ModData[]
  extra: string[]
}

export interface ModTermsResult {
  terms: Term[]
  side: string[]
  items: OverflowItem[]
}

/**
 * «Не хочу» — один терм "!a|b|c" (+ extraAvoid: исключённые флаги); «хочу» — все сразу отдельными термами или
 * «любой из» одной группой (покрытие общими подстроками, как у карт PoE 1).
 */
export function modTerms(
  data: ModsInput,
  want: string[],
  avoid: string[],
  wantMode: 'any' | 'all',
  extraAvoid: string[] = []
): ModTermsResult {
  const index = getModIndex(data)
  const toIdx = (ids: string[]): number[] =>
    [...new Set(ids)]
      .map((id) => index.byId.get(id))
      .filter((i): i is number => i !== undefined && selectable(data.mods[i]))
  const avoidIdx = toIdx(avoid)
  const avoidSet = new Set(avoidIdx)
  const wantIdx = toIdx(want).filter((i) => !avoidSet.has(i))
  const wantSet = new Set(wantIdx)
  const terms: Term[] = []
  const side = new Set<number>()
  const items: OverflowItem[] = []

  const av = coverMods(index, avoidIdx)
  av.side.forEach((j) => side.add(j))
  const avoidBody = [...av.tokens, ...extraAvoid]
  if (avoidBody.length) terms.push({ negate: true, body: avoidBody.join('|') })

  if (wantIdx.length) {
    if (wantMode === 'all') {
      for (const i of wantIdx) {
        terms.push({ negate: false, body: data.mods[i].token })
        for (const id of data.mods[i].alsoMatches ?? []) {
          const j = index.byId.get(id)
          if (j !== undefined && !wantSet.has(j)) side.add(j)
        }
      }
    } else {
      const w = coverMods(index, wantIdx)
      w.side.filter((j) => !wantSet.has(j)).forEach((j) => side.add(j))
      terms.push({ negate: false, body: w.tokens.join('|') })
    }
  }
  for (const i of [...avoidIdx, ...wantIdx]) {
    items.push({
      kind: 'mod',
      id: data.mods[i].id,
      saves: data.mods[i].token.length + 1
    })
  }
  return {
    terms,
    side: [...side]
      .filter((j) => !avoidSet.has(j))
      .sort((a, b) => a - b)
      .map((j) => data.mods[j].id),
    items
  }
}

/** Редкость «любая из» (все четыре или ни одной — без условия). */
export function rarityTerm(labels: Record<Poe2Rarity, string>, rarity: Poe2Rarity[]): Term | null {
  const list = POE2_RARITIES.filter((r) => rarity.includes(r))
  if (list.length === 0 || list.length === POE2_RARITIES.length) return null
  return { negate: false, body: list.map((r) => labels[r]).join('|') }
}

/** Только / без флага (осквернён, неопознан). */
export function flagTerm(flag: string, state: TriState): Term | null {
  if (state === 'only') return { negate: false, body: flag }
  return null
}

/** Целые a…b (1–99) одной группой: 13–16 → 1[3-6], 5–16 → ([5-9]|1[0-6]). */
export function numberRange(a: number, b: number): string {
  const lo = Math.max(0, Math.min(a, b))
  const hi = Math.min(99, Math.max(a, b))
  const parts: string[] = []
  const digits = (x: number, y: number): string => (x === y ? String(x) : y === x + 1 ? `[${x}${y}]` : `[${x}-${y}]`)
  for (let tens = Math.floor(lo / 10); tens <= Math.floor(hi / 10); tens++) {
    const from = tens === Math.floor(lo / 10) ? lo % 10 : 0
    const to = tens === Math.floor(hi / 10) ? hi % 10 : 9
    parts.push((tens > 0 ? String(tens) : '') + digits(from, to))
  }
  // одинаковые хвосты десятков: 10–39 → [1-3]\d
  const merged =
    parts.length > 2 && lo % 10 === 0 && hi % 10 === 9 && lo >= 10
      ? [`${digits(Math.floor(lo / 10), Math.floor(hi / 10))}\\d`]
      : parts
  return merged.length === 1 ? merged[0] : `(${merged.join('|')})`
}

/** Порог по строке мода в расширенном тексте: <pre><atLeast>(\(.+\))?<post>. */
export function modThreshold(pre: string, posts: string[], n: number, joinPosts: (p: string[]) => string): string {
  return `${pre}${atLeast(Math.min(999, Math.max(0, n)), { digit: '\\d', whole: pre !== '' })}${RANGE_RE}${joinPosts(posts)}`
}
