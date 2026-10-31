// Строка поиска «Путевые камни» PoE 2 (S62): моды «не хочу» → "!a|b", «хочу» — все сразу или любой из,
// пороги свойств («Pack Size: +20%» → "pack size:.*([2-9].|\d..)%"), тир по названию базы
// («Waystone (Tier 15)» → "e \(tier 1[3-6]\)"), редкость, осквернён, опознан.

import type {
  OverflowItem,
  Poe2WaystoneData,
  RegexBuildResult,
  WaystoneLabelKey,
  WaystoneQuery
} from '../../types/regex'
import { atLeast } from '../atLeast'
import { REGEX_LIMIT, joinTerms, suggestRemovals, type Term } from '../format'
import { flagTerm, modTerms, numberRange, rarityTerm } from './common'

/** Порядок порогов в строке и на странице. */
export const WAYSTONE_LABEL_KEYS: readonly WaystoneLabelKey[] = [
  'packSize',
  'rareMonsters',
  'magicMonsters',
  'itemRarity',
  'dropChance',
  'monsterRarity',
  'effectiveness'
]

/** Тиры путевых камней: T1 = уровень области 65 … T16 = 80. */
export const WAYSTONE_TIER_MAX = 16

export function emptyWaystoneQuery(): WaystoneQuery {
  return {
    tierMin: 0,
    tierMax: 0,
    rarity: [],
    corrupted: 'any',
    unidentified: 'any',
    want: [],
    avoid: [],
    wantMode: 'all',
    thresholds: {}
  }
}

/** Терм порога «свойство ≥ n %» (строка свойства без диапазона: «+20%»). */
export function waystoneThreshold(data: Poe2WaystoneData, key: WaystoneLabelKey, n: number): string {
  return `${data.labels[key]}.*${atLeast(Math.min(999, n))}%`
}

/** Терм тира a…b по названию базы; null — любой тир. */
export function tierTerm(data: Poe2WaystoneData, min: number, max: number): string | null {
  const lo = Math.max(1, min || 1)
  const hi = Math.min(WAYSTONE_TIER_MAX, max || WAYSTONE_TIER_MAX)
  if (lo <= 1 && hi >= WAYSTONE_TIER_MAX) return null
  return `${data.tier}${numberRange(Math.min(lo, hi), Math.max(lo, hi))}\\)`
}

export function buildWaystoneRegex(data: Poe2WaystoneData, q: WaystoneQuery): RegexBuildResult {
  const extraAvoid: string[] = []
  if (q.corrupted === 'exclude') extraAvoid.push(data.flags.corrupted)
  if (q.unidentified === 'exclude') extraAvoid.push(data.flags.unidentified)
  const m = modTerms(data, q.want, q.avoid, q.wantMode, extraAvoid)
  const terms: Term[] = [...m.terms]
  const items: OverflowItem[] = [...m.items]

  for (const key of WAYSTONE_LABEL_KEYS) {
    const n = Math.round(q.thresholds[key] ?? 0)
    if (n <= 0) continue
    const body = waystoneThreshold(data, key, n)
    terms.push({ negate: false, body })
    items.push({
      kind: 'option',
      key: `threshold.${key}`,
      saves: body.length + 3
    })
  }

  const tier = tierTerm(data, q.tierMin, q.tierMax)
  if (tier) {
    terms.push({ negate: false, body: tier })
    items.push({ kind: 'option', key: 'tier', saves: tier.length + 1 })
  }
  const rarity = rarityTerm(data.rarity, q.rarity)
  if (rarity) {
    terms.push(rarity)
    items.push({
      kind: 'option',
      key: 'rarity',
      saves: rarity.body.length + 3
    })
  }
  for (const t of [flagTerm(data.flags.corrupted, q.corrupted), flagTerm(data.flags.unidentified, q.unidentified)]) {
    if (t) terms.push(t)
  }

  const text = joinTerms(terms)
  const result: RegexBuildResult = {
    text,
    length: text.length,
    ok: text.length <= REGEX_LIMIT,
    sideMatches: m.side
  }
  if (!result.ok) {
    const by = text.length - REGEX_LIMIT
    result.overflow = { by, suggest: suggestRemovals(items, by) }
  }
  return result
}
