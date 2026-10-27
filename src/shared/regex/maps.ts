// Строка поиска для вкладки карт: «не хочу» → "!a|b|c", «хочу любой» → "a|b",
// «хочу все» → отдельные термы, пороги → "<метка>.*<atLeast(n)>%", флаги осквернена/неопознана.

import type {
  MapLabelKey,
  MapQuery,
  MapRegexData,
  OverflowItem,
  RegexBuildResult
} from '../types/regex'
import { atLeast } from './atLeast'
import { coverMods, getModIndex } from './cover'
import { REGEX_LIMIT, joinTerms, suggestRemovals, type Term } from './format'

/** Порядок порогов в строке и в интерфейсе. */
export const MAP_LABEL_KEYS: readonly MapLabelKey[] = [
  'quantity',
  'packSize',
  'rarity',
  'moreMaps',
  'moreScarabs',
  'moreCurrency',
  'moreDivCards'
]

export function emptyMapQuery(): MapQuery {
  // «хочу» по умолчанию — отдельными термами (макет): подсветить карту, где есть все желаемые моды
  return { want: [], avoid: [], wantMode: 'all', thresholds: {}, corrupted: 'any', unidentified: 'any' }
}

/** Терм порога «свойство ≥ n %». */
export function thresholdTerm(data: MapRegexData, key: MapLabelKey, n: number): string {
  return `${data.labels[key]}.*${atLeast(n)}%`
}

export function buildMapRegex(data: MapRegexData, q: MapQuery): RegexBuildResult {
  const index = getModIndex(data)
  const toIdx = (ids: string[]): number[] =>
    [...new Set(ids)].map((id) => index.byId.get(id)).filter((i): i is number => i !== undefined)
  const avoid = toIdx(q.avoid)
  const avoidSet = new Set(avoid)
  const want = toIdx(q.want).filter((i) => !avoidSet.has(i))

  const terms: Term[] = []
  const side = new Set<number>()
  const items: OverflowItem[] = []

  // не хочу: один терм "!a|b|c" (+ исключённые флаги); побочные совпадения прячут и желаемые моды
  const av = coverMods(index, avoid)
  av.side.forEach((j) => side.add(j))
  const avoidBody = [...av.tokens]
  if (q.corrupted === 'exclude') avoidBody.push(data.flags.corrupted)
  if (q.unidentified === 'exclude') avoidBody.push(data.flags.unidentified)
  if (avoidBody.length) terms.push({ negate: true, body: avoidBody.join('|') })

  // хочу
  const wantSet = new Set(want)
  if (want.length) {
    if (q.wantMode === 'all') {
      for (const i of want) {
        terms.push({ negate: false, body: index.mods[i].token })
        for (const id of index.mods[i].alsoMatches ?? []) {
          const j = index.byId.get(id)
          if (j !== undefined && !wantSet.has(j)) side.add(j)
        }
      }
    } else {
      const w = coverMods(index, want)
      w.side.filter((j) => !wantSet.has(j)).forEach((j) => side.add(j))
      terms.push({ negate: false, body: w.tokens.join('|') })
    }
  }
  for (const i of [...avoid, ...want]) {
    items.push({ kind: 'mod', id: index.mods[i].id, saves: index.mods[i].token.length + 1 })
  }

  // пороги свойств
  for (const key of MAP_LABEL_KEYS) {
    const n = Math.round(q.thresholds[key] ?? 0)
    if (n <= 0) continue
    const body = thresholdTerm(data, key, Math.min(n, 999))
    terms.push({ negate: false, body })
    items.push({ kind: 'threshold', key, saves: body.length + 3 })
  }

  // только осквернённые / только неопознанные
  if (q.corrupted === 'only') terms.push({ negate: false, body: data.flags.corrupted })
  if (q.unidentified === 'only') terms.push({ negate: false, body: data.flags.unidentified })

  const text = joinTerms(terms)
  const result: RegexBuildResult = {
    text,
    length: text.length,
    ok: text.length <= REGEX_LIMIT,
    sideMatches: [...side]
      .filter((j) => !avoidSet.has(j))
      .sort((a, b) => a - b)
      .map((j) => index.mods[j].id)
  }
  if (!result.ok) {
    const by = text.length - REGEX_LIMIT
    result.overflow = { by, suggest: suggestRemovals(items, by) }
  }
  return result
}
