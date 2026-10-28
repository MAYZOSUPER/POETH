// Приведение источников цен к PriceEntry (чистый модуль; tests/wealth/prices.test.ts).
//  - фид обмена GGG: короткий metadata-id → английское имя (resources/data/poe1/wealth/exchange-ids.json,
//    собирается tools/wealth/sync-exchange-ids.mjs из RePoE base_items);
//  - poe.watch: GET https://api.poe.watch/compact?league=<лига> (публичный API, один запрос на все
//    категории, кэш Cloudflare 20 мин).

import type { PriceEntry, PriceKind } from './prices'
import { isLowVolume, type ExchangePrices } from './exchange'

/** Файл сопоставления id фида с именами. */
export interface ExchangeIdNames {
  version: 1
  /** когда собран (ISO) */
  generatedAt?: string
  /** 'Currency/CurrencyRerollRare' → 'Chaos Orb' */
  names: Record<string, string>
}

export function exchangeEntries(prices: ExchangePrices, names: Readonly<Record<string, string>>): PriceEntry[] {
  const out: PriceEntry[] = []
  for (const [id, p] of prices.byId) {
    const name = names[id]
    if (!name || !(p.chaos > 0)) continue
    const e: PriceEntry = { name, kind: 'stackable', chaos: p.chaos, source: 'exchange' }
    if (isLowVolume(p)) e.low = true
    out.push(e)
  }
  return out
}

/** Запись /compact poe.watch (нужные поля). */
export interface PoeWatchItem {
  name?: unknown
  category?: unknown
  group?: unknown
  frame?: unknown
  mean?: unknown
  lowConfidence?: unknown
  linkCount?: unknown
  gemLevel?: unknown
  gemQuality?: unknown
  gemIsCorrupted?: unknown
  mapTier?: unknown
}

/** Категории экипировки: не уники там — базы с ilvl/влиянием, их не оцениваем. */
const GEAR = new Set(['armour', 'weapons', 'accessories', 'jewels', 'flasks'])

function pos(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
}

export function poeWatchKind(it: PoeWatchItem): PriceKind | null {
  const frame = typeof it.frame === 'number' ? it.frame : -1
  const cat = typeof it.category === 'string' ? it.category : ''
  if (frame === 3 || frame === 9) return 'unique'
  if (cat === 'gem') return 'gem'
  if (cat === 'maps' && it.group === 'maps') return 'map'
  if (GEAR.has(cat)) return null
  return 'stackable'
}

/** Ответ /compact → записи цен (без нулевых цен и мусора). */
export function poeWatchEntries(json: unknown): PriceEntry[] {
  const items = (json as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return []
  const out: PriceEntry[] = []
  for (const it of items as PoeWatchItem[]) {
    if (!it || typeof it.name !== 'string' || !it.name) continue
    const chaos = pos(it.mean)
    const kind = poeWatchKind(it)
    if (!chaos || !kind) continue
    const e: PriceEntry = { name: it.name, kind, chaos, source: 'poewatch' }
    if (it.lowConfidence === true) e.low = true
    const links = pos(it.linkCount)
    if (links && kind === 'unique') e.links = links
    if (kind === 'gem') {
      e.gemLevel = pos(it.gemLevel) ?? 1
      e.gemQuality = pos(it.gemQuality) ?? 0
      e.corrupted = it.gemIsCorrupted === true
    }
    const tier = pos(it.mapTier)
    if (tier && (kind === 'map' || kind === 'unique')) e.mapTier = tier
    out.push(e)
  }
  return out
}

/** Компактная копия ответа poe.watch для кэша на диске (только нужные поля). */
export function compactPoeWatch(json: unknown): { items: PoeWatchItem[] } {
  const items = (json as { items?: unknown } | null)?.items
  if (!Array.isArray(items)) return { items: [] }
  const keep: Array<keyof PoeWatchItem> = [
    'name',
    'category',
    'group',
    'frame',
    'mean',
    'lowConfidence',
    'linkCount',
    'gemLevel',
    'gemQuality',
    'gemIsCorrupted',
    'mapTier'
  ]
  return {
    items: (items as PoeWatchItem[])
      .filter((it) => it && poeWatchKind(it) !== null && pos(it.mean))
      .map((it) => {
        const o: PoeWatchItem = {}
        for (const k of keep) if (it[k] !== undefined && it[k] !== null && it[k] !== 0 && it[k] !== '') o[k] = it[k]
        return o
      })
  }
}
