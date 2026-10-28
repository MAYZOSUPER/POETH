// Сопоставление предметов стэша с ценами (чистый модуль; tests/wealth/prices.test.ts).
//
// Источники (PriceSource в main) приводятся к PriceEntry. Правила — свои, по идеям из
// описания Exilence в плане (код Exilence не используется):
//  - валюта, фрагменты, карты, скарабеи, эссенции… — фид обмена GGG по английскому имени,
//    запасной вариант — те же категории poe.watch;
//  - уники — по имени; 5L/6L — отдельная цена, без неё — цена без линков; варианты различаем
//    только если цена одна; уникальные карты — ещё и по ярусу;
//  - камни — имя, осквернение, уровень (точный или ближайший меньший), качество (ближайшее меньшее);
//  - карты (не уники) — базовое имя + ярус;
//  - рарки и прочее — «без оценки».
// Цена назначается, только если после правил остался ровно один кандидат.

import type { PriceSourceId, UnpricedReason, WealthItemNs } from '../types/wealth'
import type { StashItem } from './stash'

export type PriceKind = 'stackable' | 'unique' | 'gem' | 'map'

export interface PriceEntry {
  /** английское имя (уник — его имя, остальное — базовое имя) */
  name: string
  kind: PriceKind
  /** chaos за штуку */
  chaos: number
  source: PriceSourceId
  low?: boolean
  links?: number
  gemLevel?: number
  gemQuality?: number
  corrupted?: boolean
  mapTier?: number
}

export interface PriceIndex {
  get(kind: PriceKind, name: string): readonly PriceEntry[]
  readonly size: number
}

/** Индекс по (вид, имя); источники в порядке приоритета — первый, знающий имя, побеждает. */
export function buildPriceIndex(sources: ReadonlyArray<readonly PriceEntry[]>): PriceIndex {
  const map = new Map<string, PriceEntry[]>()
  let size = 0
  for (const entries of sources) {
    const seen = new Set<string>()
    for (const e of entries) {
      if (!(e.chaos > 0) || !e.name) continue
      const key = `${e.kind}\u0000${e.name}`
      const list = map.get(key)
      // имя уже покрыто источником повыше — этот источник для него не нужен
      if (list && !seen.has(key)) continue
      seen.add(key)
      if (list) list.push(e)
      else map.set(key, [e])
      size++
    }
  }
  return {
    get: (kind, name) => map.get(`${kind}\u0000${name}`) ?? [],
    size
  }
}

export interface PriceMatch {
  ns: WealthItemNs
  /** имя для строки снимка */
  name: string
  unit?: number
  source?: PriceSourceId
  low?: boolean
  reason?: UnpricedReason
}

const UNIQUE_FRAMES = new Set([3, 9, 10])

export function itemNs(it: StashItem): WealthItemNs {
  if (UNIQUE_FRAMES.has(it.frameType)) return 'UNIQUE'
  if (it.frameType === 4) return 'GEM'
  if (it.frameType === 6) return 'DIVINATION_CARD'
  return 'ITEM'
}

/** Имя строки: уник — его имя, камень и карта Таро — typeLine, остальное — базовое имя. */
export function itemName(it: StashItem): string {
  const ns = itemNs(it)
  if (ns === 'UNIQUE') return it.name || it.baseType
  if (ns === 'GEM' || ns === 'DIVINATION_CARD') return it.typeLine
  return it.baseType || it.typeLine
}

function one(list: readonly PriceEntry[]): PriceEntry | null | 'many' {
  if (!list.length) return null
  return list.length === 1 ? list[0] : 'many'
}

/** Ближайшее значение ≤ want из списка (или undefined). */
function bestNotAbove(values: number[], want: number): number | undefined {
  let best: number | undefined
  for (const v of values) if (v <= want && (best === undefined || v > best)) best = v
  return best
}

function matchGem(it: StashItem, list: readonly PriceEntry[]): PriceEntry | null | 'many' {
  const corrupted = it.corrupted
  let c = list.filter((e) => (e.corrupted ?? false) === corrupted)
  if (!c.length) return null
  const level = it.gemLevel ?? 1
  const lvl = bestNotAbove(
    c.map((e) => e.gemLevel ?? 1),
    level
  )
  if (lvl === undefined) return null
  c = c.filter((e) => (e.gemLevel ?? 1) === lvl)
  const q = bestNotAbove(
    c.map((e) => e.gemQuality ?? 0),
    it.gemQuality ?? 0
  )
  if (q === undefined) return null
  return one(c.filter((e) => (e.gemQuality ?? 0) === q))
}

function matchUnique(it: StashItem, list: readonly PriceEntry[]): PriceEntry | null | 'many' {
  let c = [...list]
  if (it.mapTier !== undefined && c.some((e) => e.mapTier !== undefined)) {
    c = c.filter((e) => e.mapTier === undefined || e.mapTier === it.mapTier)
  }
  if (it.links >= 5) {
    const linked = c.filter((e) => e.links === it.links)
    if (linked.length) return one(linked)
  }
  return one(c.filter((e) => (e.links ?? 0) < 5))
}

function matchMap(it: StashItem, list: readonly PriceEntry[]): PriceEntry | null | 'many' {
  const tiered = list.filter((e) => e.mapTier === it.mapTier)
  if (tiered.length) return one(tiered)
  return one(list.filter((e) => e.mapTier === undefined))
}

/** Цена одной штуки предмета по индексу. */
export function matchPrice(it: StashItem, index: PriceIndex): PriceMatch {
  const ns = itemNs(it)
  const name = itemName(it)
  const res = (r: PriceEntry | null | 'many', noneReason: UnpricedReason = 'no-price'): PriceMatch => {
    if (r === 'many') return { ns, name, reason: 'ambiguous' }
    if (!r) return { ns, name, reason: noneReason }
    const m: PriceMatch = { ns, name, unit: r.chaos, source: r.source }
    if (r.low) m.low = true
    return m
  }
  if (!index.size) return { ns, name, reason: 'no-source' }

  if (ns === 'UNIQUE') return res(matchUnique(it, index.get('unique', name)))
  if (ns === 'GEM') return res(matchGem(it, index.get('gem', name)))
  if (it.mapTier !== undefined) return res(matchMap(it, index.get('map', name)), it.frameType === 2 ? 'rare' : 'no-price')
  // рарки и магические предметы экипировки — без оценки (у магических typeLine с аффиксами)
  if (it.frameType === 2) return { ns, name, reason: 'rare' }
  const stack = index.get('stackable', name)
  if (stack.length) return res(one(stack))
  return { ns, name, reason: 'no-price' }
}
