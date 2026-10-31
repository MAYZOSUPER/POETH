// Строка поиска «Торговец» PoE 2 (S62): свойства снаряжения (жизнь, сопротивления, уровни умений, скорость…),
// класс и редкость (отдельные «И»), гнёзда под руны («Sockets: S S»), качество.

import type {
  OverflowItem,
  Poe2ItemClass,
  Poe2VendorData,
  Poe2VendorKey,
  Poe2VendorQuery,
  RegexBuildResult
} from '../../types/regex'
import { atLeast } from '../atLeast'
import { REGEX_LIMIT, joinTerms, suggestRemovals, type Term } from '../format'
import { joinPosts } from '../vendor'
import { modThreshold, rarityTerm } from './common'

/** Порядок на странице и в строке. */
export const POE2_VENDOR_KEYS: readonly Poe2VendorKey[] = [
  'life',
  'mana',
  'energyShield',
  'spirit',
  'resFire',
  'resCold',
  'resLightning',
  'resChaos',
  'resAll',
  'gemAll',
  'gemSpell',
  'gemFire',
  'gemCold',
  'gemLightning',
  'gemChaos',
  'gemPhys',
  'gemMinion',
  'gemMelee',
  'gemProjectile',
  'spellDamage',
  'physDamage',
  'addPhys',
  'addFire',
  'addCold',
  'addLightning',
  'addChaos',
  'addAttackPhys',
  'addAttackFire',
  'addAttackCold',
  'addAttackLightning',
  'moveSpeed',
  'attackSpeed',
  'castSpeed',
  'critChance',
  'str',
  'dex',
  'int',
  'allAttributes',
  'rarity'
]

/** Группы свойств на странице. */
export const POE2_VENDOR_GROUPS: readonly {
  id: string
  keys: readonly Poe2VendorKey[]
}[] = [
  { id: 'defence', keys: ['life', 'mana', 'energyShield', 'spirit'] },
  {
    id: 'res',
    keys: ['resFire', 'resCold', 'resLightning', 'resChaos', 'resAll']
  },
  {
    id: 'gems',
    keys: [
      'gemAll',
      'gemSpell',
      'gemFire',
      'gemCold',
      'gemLightning',
      'gemChaos',
      'gemPhys',
      'gemMinion',
      'gemMelee',
      'gemProjectile'
    ]
  },
  {
    id: 'damage',
    keys: [
      'spellDamage',
      'physDamage',
      'addPhys',
      'addFire',
      'addCold',
      'addLightning',
      'addChaos',
      'addAttackPhys',
      'addAttackFire',
      'addAttackCold',
      'addAttackLightning'
    ]
  },
  {
    id: 'speed',
    keys: ['moveSpeed', 'attackSpeed', 'castSpeed', 'critChance']
  },
  { id: 'attr', keys: ['str', 'dex', 'int', 'allAttributes', 'rarity'] }
]

export const POE2_ITEM_CLASSES: readonly Poe2ItemClass[] = [
  'boots',
  'gloves',
  'helmet',
  'bodyArmour',
  'shield',
  'buckler',
  'focus',
  'quiver',
  'ring',
  'amulet',
  'belt',
  'wand',
  'staff',
  'sceptre',
  'quarterstaff',
  'bow',
  'crossbow',
  'spear',
  'mace1h',
  'mace2h',
  'flail',
  'lifeFlask',
  'manaFlask',
  'charm'
]

/** Гнёзд под руны: у брони до 2–3, у оружия до 4 (с запасом). */
export const POE2_SOCKETS_MAX = 6

export function emptyPoe2VendorQuery(): Poe2VendorQuery {
  return {
    mods: {},
    itemClass: '',
    rarity: [],
    sockets: 0,
    quality: 0,
    mode: 'any'
  }
}

/** У свойства есть порог «≥ N» (строка с одним числом). */
export function poe2HasThreshold(data: Poe2VendorData, key: Poe2VendorKey): boolean {
  return data.props[key].token === undefined
}

/** Фрагмент свойства: порог — <pre><atLeast>(диапазон)?(<posts>), без порога — токен. */
export function poe2VendorPattern(data: Poe2VendorData, key: Poe2VendorKey, n = 0): string {
  const p = data.props[key]
  if (p.token !== undefined) return p.token
  return modThreshold(p.pre ?? '', p.posts ?? [], Math.max(1, n), joinPosts)
}

/** «Sockets: S S»: n гнёзд и больше. */
export function socketsPattern(data: Poe2VendorData, n: number): string {
  return `${data.sockets}${' s'.repeat(Math.max(1, Math.min(POE2_SOCKETS_MAX, n)))}`
}

/** «Quality: +20% (augmented)» — свойство без диапазона. */
export function qualityPattern(data: Poe2VendorData, n: number): string {
  return `${data.quality}.*${atLeast(Math.min(999, n))}%`
}

/** Выбранные свойства в порядке страницы (без русского текста в RU-данных — не берём). */
export function selectedPoe2Props(data: Poe2VendorData, q: Poe2VendorQuery): Poe2VendorKey[] {
  return POE2_VENDOR_KEYS.filter((k) => (q.mods[k] ?? 0) > 0 && !data.props[k].noRu)
}

/**
 * «Любое из»: пороги с одинаковым началом и числом — одной группой хвостов, как у «Торговца» PoE 1 (joinPosts):
 * сопротивления 20 / 20 / 20 → \+(…)(\(.+\))?% to (fire|cold|lightning) r.
 */
function anyBody(data: Poe2VendorData, q: Poe2VendorQuery, keys: Poe2VendorKey[]): string {
  const groups = new Map<string, { pre: string; n: number; posts: string[] }>()
  const out: string[] = []
  for (const k of keys) {
    const p = data.props[k]
    const n = Math.max(1, q.mods[k] ?? 0)
    if (p.token !== undefined) {
      out.push(p.token)
      continue
    }
    const key = `${p.pre ?? ''}\n${n}`
    const g = groups.get(key)
    if (g) g.posts.push(...(p.posts ?? []))
    else {
      const ng = { pre: p.pre ?? '', n, posts: [...(p.posts ?? [])] }
      groups.set(key, ng)
      out.push(key)
    }
  }
  return out
    .map((x) => {
      const g = groups.get(x)
      return g ? modThreshold(g.pre, g.posts, g.n, joinPosts) : x
    })
    .join('|')
}

export function buildPoe2VendorRegex(data: Poe2VendorData, q: Poe2VendorQuery): RegexBuildResult {
  const terms: Term[] = []
  const items: OverflowItem[] = []
  const keys = selectedPoe2Props(data, q)
  const parts = keys.map((k) => ({
    k,
    body: poe2VendorPattern(data, k, q.mods[k] ?? 0)
  }))
  if (q.mode === 'all') {
    for (const p of parts) terms.push({ negate: false, body: p.body })
  } else if (parts.length) {
    terms.push({ negate: false, body: anyBody(data, q, keys) })
  }
  for (const p of parts) items.push({ kind: 'option', key: `mod.${p.k}`, saves: p.body.length + 1 })

  if (q.itemClass) {
    const body = data.classes[q.itemClass]
    terms.push({ negate: false, body })
    items.push({ kind: 'option', key: 'class', saves: body.length + 1 })
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
  if (q.sockets > 0) {
    const body = socketsPattern(data, q.sockets)
    terms.push({ negate: false, body })
    items.push({ kind: 'option', key: 'sockets', saves: body.length + 3 })
  }
  if (q.quality > 0) {
    const body = qualityPattern(data, q.quality)
    terms.push({ negate: false, body })
    items.push({ kind: 'option', key: 'quality', saves: body.length + 1 })
  }

  const text = joinTerms(terms)
  const result: RegexBuildResult = {
    text,
    length: text.length,
    ok: text.length <= REGEX_LIMIT,
    sideMatches: []
  }
  if (!result.ok) {
    const by = text.length - REGEX_LIMIT
    result.overflow = { by, suggest: suggestRemovals(items, by) }
  }
  return result
}
