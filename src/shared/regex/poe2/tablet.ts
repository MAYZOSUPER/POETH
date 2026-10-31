// Строка поиска «Плитки» PoE 2 (S62): тип (любой из), использований ≥ N, редкость, моды «не хочу / хочу».

import type { OverflowItem, Poe2TabletData, RegexBuildResult, TabletQuery, TabletType } from '../../types/regex'
import { atLeast } from '../atLeast'
import { REGEX_LIMIT, joinTerms, suggestRemovals, type Term } from '../format'
import { modTerms, rarityTerm } from './common'

export const TABLET_TYPES: readonly TabletType[] = [
  'breach',
  'delirium',
  'ritual',
  'expedition',
  'abyss',
  'irradiated',
  'overseer',
  'temple'
]

/** Использований у плитки в 0.5 — до 10 (с запасом: уникальные и будущие патчи). */
export const TABLET_USES_MAX = 30

export function emptyTabletQuery(): TabletQuery {
  return { types: [], usesMin: 0, rarity: [], want: [], avoid: [], wantMode: 'all' }
}

/** «≥ N использований»: «10 uses remaining» / «Осталось зарядов - 10» (число без диапазона). */
export function usesTerm(data: Poe2TabletData, n: number): string {
  const { pre, post } = data.uses
  return `${pre}${atLeast(Math.min(999, n), { digit: '\\d', whole: pre !== '' })}${post}`
}

/** Моды, которые бывают на выбранных типах (пусто — все). */
export function modsForTypes(data: Poe2TabletData, types: TabletType[]): Poe2TabletData['mods'] {
  if (types.length === 0) return data.mods
  return data.mods.filter((m) => !m.types || m.types.some((t) => types.includes(t)))
}

export function buildTabletRegex(data: Poe2TabletData, q: TabletQuery): RegexBuildResult {
  const m = modTerms(data, q.want, q.avoid, q.wantMode)
  const terms: Term[] = [...m.terms]
  const items: OverflowItem[] = [...m.items]

  const types = TABLET_TYPES.filter((t) => q.types.includes(t))
  if (types.length > 0 && types.length < TABLET_TYPES.length) {
    const body = types.map((t) => data.types[t]).join('|')
    terms.push({ negate: false, body })
    items.push({ kind: 'option', key: 'types', saves: body.length + 3 })
  }
  const uses = Math.round(q.usesMin)
  if (uses > 0) {
    const body = usesTerm(data, uses)
    terms.push({ negate: false, body })
    items.push({ kind: 'option', key: 'uses', saves: body.length + 3 })
  }
  const rarity = rarityTerm(data.rarity, q.rarity)
  if (rarity) {
    terms.push(rarity)
    items.push({ kind: 'option', key: 'rarity', saves: rarity.body.length + 3 })
  }

  const text = joinTerms(terms)
  const result: RegexBuildResult = { text, length: text.length, ok: text.length <= REGEX_LIMIT, sideMatches: m.side }
  if (!result.ok) {
    const by = text.length - REGEX_LIMIT
    result.overflow = { by, suggest: suggestRemovals(items, by) }
  }
  return result
}
