// Тиры уников T0/T1/T2, ликвидность, уверенность и «обычно продаётся за» по снимку poe.ninja (S33).
// Новичку главное — «этот уник дорогой, не продавай торговцу». Цена poe.ninja — оценка по лотам сайта, а не
// сделки: при малой выборке (мало наблюдений или лотов) тир помечается «мало данных», уверенность ниже.

import type { ItemLine, ItemLiquidity, ItemRow, UniqueTier } from '../../types/flip'
import { formKey, isFoulborn, isPlainUnique, uniqueName, unlinkedForms } from './snapshot'

/** Пороги тиров в divine. */
export const TIER_DIV: Readonly<Record<Exclude<UniqueTier, 'low'>, number>> = { T0: 10, T1: 1, T2: 0.1 }
export const TIER_ORDER: readonly UniqueTier[] = ['T0', 'T1', 'T2', 'low']

/** Малая выборка: наблюдений или лотов меньше. */
export const THIN_COUNT = 5
export const THIN_LISTINGS = 5

/** Продаётся быстро / за несколько часов: пороги наблюдений и лотов poe.ninja. */
export const FAST = { count: 30, listings: 20 }
export const NORMAL = { count: 8, listings: 5 }

/**
 * «Обычно продаётся за» = цена poe.ninja × коэффициент: чтобы продать, ставят чуть ниже рынка, и тем ниже,
 * чем медленнее уходит предмет (как реалистичная цена продажи валюты в S25, а не лучший лот).
 */
export const SELL_FACTOR: Readonly<Record<ItemLiquidity, number>> = { fast: 0.95, normal: 0.9, slow: 0.85 }

/** Топ ликвидных для «Недооценённых»: дороже порога и продаются быстро. */
export const TOP_MIN_DIV = 0.5
export const TOP_SIZE = 30

export function tierOf(div: number): UniqueTier {
  if (div >= TIER_DIV.T0) return 'T0'
  if (div >= TIER_DIV.T1) return 'T1'
  if (div >= TIER_DIV.T2) return 'T2'
  return 'low'
}

export const tierRank = (t: UniqueTier): number => TIER_ORDER.indexOf(t)

export function isThin(l: Pick<ItemLine, 'count' | 'listings'>): boolean {
  return l.count < THIN_COUNT || l.listings < THIN_LISTINGS
}

export function liquidityOf(l: Pick<ItemLine, 'count' | 'listings'>): ItemLiquidity {
  if (l.count >= FAST.count && l.listings >= FAST.listings) return 'fast'
  if (l.count >= NORMAL.count && l.listings >= NORMAL.listings) return 'normal'
  return 'slow'
}

/** Насколько скачет цена за неделю: размах точек sparkline poe.ninja (в долях). */
export function swingOf(l: Pick<ItemLine, 'spark' | 'change'>): number {
  const pts = (l.spark ?? []).filter((x): x is number => typeof x === 'number')
  if (pts.length < 2) return Math.abs(l.change ?? 0) / 100
  return (Math.max(...pts) - Math.min(...pts)) / 100
}

/**
 * Уверенность 0–1: от числа наблюдений (1 → 0,25 … 20+ → 1), меньше при малом числе лотов и при цене,
 * которая за неделю скачет больше чем наполовину.
 */
export function confidenceOf(l: Pick<ItemLine, 'count' | 'listings' | 'spark' | 'change'>): number {
  const c = l.count
  let v = c >= 20 ? 1 : c >= 10 ? 0.8 : c >= 5 ? 0.6 : c >= 3 ? 0.45 : 0.25
  if (l.listings < 5) v *= 0.75
  else if (l.listings < 10) v *= 0.9
  const swing = swingOf(l)
  if (swing > 1) v *= 0.7
  else if (swing > 0.5) v *= 0.85
  return Math.round(v * 100) / 100
}

/** Варианты, которые трейд не различит: то же имя, база и связи, другие варианты, а stat-фильтров нет. */
function ambiguousIds(lines: readonly ItemLine[]): Set<string> {
  const byKey = new Map<string, ItemLine[]>()
  for (const l of lines) {
    const k = `${l.name}\u0000${l.base}\u0000${l.links ?? 0}`
    const list = byKey.get(k) ?? []
    list.push(l)
    byKey.set(k, list)
  }
  const out = new Set<string>()
  for (const list of byKey.values()) {
    if (list.length < 2) continue
    const lo = Math.min(...list.map((l) => l.chaos))
    const hi = Math.max(...list.map((l) => l.chaos))
    // цены вариантов почти равны (±15 %) — неважно, какой попадётся
    if (hi <= lo * 1.15) continue
    for (const l of list) if (!l.trade?.length) out.add(l.id)
  }
  return out
}

/** Строки вкладки по снимку: только обычные уники (не фольга), тир, ликвидность, уверенность, топ. */
export function buildRows(lines: readonly ItemLine[], divine: number): ItemRow[] {
  const plain = lines.filter(isPlainUnique)
  const linked = unlinkedForms(plain)
  const ambiguous = ambiguousIds(plain)
  const rate = divine > 0 ? divine : 0
  const rows: ItemRow[] = plain.map((l) => {
    const div = rate ? l.chaos / rate : 0
    const liquidity = liquidityOf(l)
    const row: ItemRow = {
      id: l.id,
      name: uniqueName(l),
      base: l.base,
      foulborn: isFoulborn(l),
      type: l.type,
      chaos: l.chaos,
      div,
      tier: rate ? tierOf(div) : 'low',
      thin: isThin(l),
      count: l.count,
      listings: l.listings,
      liquidity,
      confidence: confidenceOf(l),
      sell: l.chaos * SELL_FACTOR[liquidity]
    }
    if (l.variant) row.variant = l.variant
    if (l.links) row.links = l.links
    else if (linked.has(formKey(l))) row.unlinked = true
    if (l.itemType) row.itemType = l.itemType
    if (l.change !== undefined) row.change = l.change
    if (ambiguous.has(l.id)) row.ambiguous = true
    return row
  })
  for (const id of topLiquid(rows)) {
    const r = rows.find((x) => x.id === id)
    if (r) r.top = true
  }
  return rows
}

/**
 * Топ ликвидных для «Недооценённых»: от TOP_MIN_DIV, продаются быстро, вариант различим, не «мало данных»;
 * по обороту (цена × наблюдения).
 */
export function topLiquid(rows: readonly ItemRow[], size = TOP_SIZE): string[] {
  return rows
    .filter((r) => r.div >= TOP_MIN_DIV && r.liquidity === 'fast' && !r.ambiguous && !r.thin)
    .sort((a, b) => b.chaos * b.count - a.chaos * a.count)
    .slice(0, size)
    .map((r) => r.id)
}

/** Тир по имени уника — для новичка: «что выпало» и «бывает ли дороже». */
export interface TierGroup {
  /** английское имя без Foulborn */
  name: string
  base: string
  /** обычная форма: не Foulborn, без связей; из вариантов — самый дешёвый с надёжными данными */
  main: ItemRow
  /** самый дорогой надёжный вариант (связи, Foulborn, вариант), если он выше тиром, чем main */
  top?: ItemRow
  rows: ItemRow[]
}

export function groupTiers(rows: readonly ItemRow[]): TierGroup[] {
  const byName = new Map<string, ItemRow[]>()
  for (const r of rows) {
    const k = `${r.name}\u0000${r.base}`
    const list = byName.get(k) ?? []
    list.push(r)
    byName.set(k, list)
  }
  const out: TierGroup[] = []
  for (const list of byName.values()) {
    const plain = list.filter((r) => !r.foulborn && !r.links)
    const pool = plain.length ? plain : list
    const sure = pool.filter((r) => !r.thin)
    const main = [...(sure.length ? sure : pool)].sort((a, b) => a.chaos - b.chaos)[0]
    const best = list.filter((r) => !r.thin && r !== main).sort((a, b) => b.chaos - a.chaos)[0]
    const g: TierGroup = { name: main.name, base: main.base, main, rows: [...list].sort((a, b) => b.chaos - a.chaos) }
    if (best && tierRank(best.tier) < tierRank(main.tier)) g.top = best
    out.push(g)
  }
  return out.sort((a, b) => (b.top?.chaos ?? b.main.chaos) - (a.top?.chaos ?? a.main.chaos))
}
