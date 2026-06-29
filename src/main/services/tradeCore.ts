// Pure, dependency-free core of the PoE2 trade2 price-check: clipboard item
// parsing, search-body construction, price summarization and the rate limiter.
// No electron / network imports here so this stays unit-testable in plain Node.
// IO + orchestration live in tradeClient.ts.
//
// Item-format facts (section split, EN/RU client strings, nameplate order) are
// taken verbatim from Exiled Exchange 2 (MIT) — see the price-check plan.

import type { TradeListing } from '@shared/types'

export type ItemKind = 'unique' | 'rare' | 'magic' | 'normal' | 'currency' | 'gem' | 'divcard'

export interface ParsedItem {
  /** canonical English rarity word (Normal|Magic|Rare|Unique) or Currency/Gem/Divination Card */
  rarity: string
  kind: ItemKind
  /** nameplate line 3 (unique/rare name, or the currency/gem name) */
  name: string
  /** nameplate line 4 (base type), when present */
  baseType?: string
  itemClass?: string
  itemLevel?: number
  gemLevel?: number
  identified: boolean
  corrupted: boolean
}

// ---- localized client strings (English ∪ Russian), verbatim incl. trailing spaces ----
const PREFIX = {
  itemClass: ['Item Class: ', 'Класс предмета: '],
  rarity: ['Rarity: ', 'Редкость: '],
  itemLevel: ['Item Level: ', 'Уровень предмета: '],
  gemLevel: ['Level: ', 'Уровень: ']
}

const CORRUPTED = ['Corrupted', 'Осквернено']
const CANNOT_USE = [
  'You cannot use this item. Its stats will be ignored',
  'Вы не можете использовать этот предмет, его параметры не будут учтены'
]
const UNIDENTIFIED = [
  /^Unidentified(?:\s*\(Tier\s*\d+\))?$/,
  /^Неопознано(?:\s*\(Ранг\s*\d+\))?$/
]

const RARITY: Record<string, { rarity: string; kind: ItemKind }> = {
  Normal: { rarity: 'Normal', kind: 'normal' },
  Обычный: { rarity: 'Normal', kind: 'normal' },
  Magic: { rarity: 'Magic', kind: 'magic' },
  Волшебный: { rarity: 'Magic', kind: 'magic' },
  Rare: { rarity: 'Rare', kind: 'rare' },
  Редкий: { rarity: 'Rare', kind: 'rare' },
  Unique: { rarity: 'Unique', kind: 'unique' },
  Уникальный: { rarity: 'Unique', kind: 'unique' },
  Gem: { rarity: 'Gem', kind: 'gem' },
  Камень: { rarity: 'Gem', kind: 'gem' },
  Currency: { rarity: 'Currency', kind: 'currency' },
  Валюта: { rarity: 'Currency', kind: 'currency' },
  'Divination Card': { rarity: 'Divination Card', kind: 'divcard' },
  'Гадальная карта': { rarity: 'Divination Card', kind: 'divcard' },
  Quest: { rarity: 'Normal', kind: 'normal' },
  Задание: { rarity: 'Normal', kind: 'normal' }
}

function matchPrefix(line: string, prefixes: string[]): string | null {
  for (const p of prefixes) if (line.startsWith(p)) return line.slice(p.length)
  return null
}

function isUnidentified(line: string): boolean {
  const t = line.trim()
  return UNIDENTIFIED.some((re) => re.test(t))
}

/** Strip the game's nameplate markup tags (`<<set:..>>`, `<if:..>{..}`). */
function stripMarkup(text: string): string {
  return text
    .replace(/<<set:.+?>>/g, '')
    .replace(/<(if:.+?|elif:.+?|else)>\{(.+?)\}/g, (_m, type: string, body: string) =>
      type.startsWith('if:') ? body : ''
    )
}

/** Split clipboard text into sections delimited by a dashes-only line. */
export function toSections(text: string): string[][] {
  const lines = text.split(/\r?\n/)
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  const sections: string[][] = [[]]
  for (const ln of lines) {
    if (/^-{3,}$/.test(ln)) sections.push([])
    else sections[sections.length - 1].push(ln)
  }
  return sections.filter((s) => s.length > 0)
}

/** Parse a copied PoE2 item; returns null when the text isn't an item. */
export function parseItem(text: string): ParsedItem | null {
  if (!text) return null
  const sections = toSections(text)
  if (!sections.length) return null

  // Detection: section 0 must lead with an Item Class line, or a Rarity line
  // (uncut/meta gems omit Item Class).
  const first = sections[0][0] ?? ''
  const leadsClass = PREFIX.itemClass.some((p) => first.startsWith(p))
  const leadsRarity = PREFIX.rarity.some((p) => first.startsWith(p))
  if (!leadsClass && !leadsRarity) return null

  // Nameplate (section 0), dropping any "cannot use this item" line that would
  // otherwise shift the name/base-type lines for off-class items.
  const head = sections[0].filter((l) => !CANNOT_USE.includes(l.trim()))
  let idx = 0

  let itemClass: string | undefined
  const cls = matchPrefix(head[idx] ?? '', PREFIX.itemClass)
  if (cls !== null) {
    itemClass = cls.trim()
    idx++
  }

  let rarity = 'Normal'
  let kind: ItemKind = 'normal'
  const rarityRaw = matchPrefix(head[idx] ?? '', PREFIX.rarity)
  if (rarityRaw !== null) {
    const r = RARITY[rarityRaw.trim()]
    if (r) {
      rarity = r.rarity
      kind = r.kind
    }
    idx++
  }

  const name = head[idx] !== undefined ? stripMarkup(head[idx]) : ''
  idx++
  const baseType = head[idx] !== undefined ? stripMarkup(head[idx]) : undefined

  // Scan all sections for item level, gem level, corrupted and identified.
  let itemLevel: number | undefined
  let gemLevel: number | undefined
  let corrupted = false
  let identified = true
  for (const section of sections) {
    if (CORRUPTED.includes((section[0] ?? '').trim())) corrupted = true
    for (const line of section) {
      // First valid value wins; a well-formed item has exactly one of each.
      if (itemLevel === undefined) {
        const il = matchPrefix(line, PREFIX.itemLevel)
        if (il !== null) {
          const n = Number(il.trim())
          if (!Number.isNaN(n)) itemLevel = n
        }
      }
      if (kind === 'gem' && gemLevel === undefined) {
        const gl = matchPrefix(line, PREFIX.gemLevel)
        if (gl !== null) {
          const n = Number(gl.trim())
          if (!Number.isNaN(n)) gemLevel = n
        }
      }
      if (isUnidentified(line)) identified = false
    }
  }

  return { rarity, kind, name, baseType, itemClass, itemLevel, gemLevel, identified, corrupted }
}

// ---------------------------------------------------------------------------
// Trade search body
// ---------------------------------------------------------------------------

export interface TradeSearchBody {
  query: {
    status: { option: 'online' | 'any' }
    name?: string
    type?: string
    stats: Array<{ type: 'and'; filters: [] }>
    filters: {
      type_filters?: {
        filters: {
          rarity?: { option: 'nonunique' | 'unique' | 'magic' }
          category?: { option: string }
          ilvl?: { min?: number; max?: number }
        }
      }
      misc_filters?: { filters: { gem_level?: { min?: number; max?: number } } }
    }
  }
  sort: { price: 'asc' }
}

/** Map a (localized) item class to a trade gem category, or null. */
function gemCategory(itemClass?: string): string | null {
  if (!itemClass) return null
  const c = itemClass.toLowerCase()
  if (c.includes('support')) return 'gem.supportgem'
  if (c.includes('meta')) return 'gem.metagem'
  if (c.includes('gem')) return 'gem.activegem'
  return null
}

/** The human label of what we end up searching for. */
export function searchLabel(item: ParsedItem): string {
  if (item.kind === 'unique' && item.identified) return item.name
  return item.baseType ?? item.name
}

export function buildSearchBody(item: ParsedItem): TradeSearchBody {
  const body: TradeSearchBody = {
    query: { status: { option: 'online' }, stats: [{ type: 'and', filters: [] }], filters: {} },
    sort: { price: 'asc' }
  }
  const q = body.query

  if (item.kind === 'unique' && item.identified) {
    q.name = item.name
    if (item.baseType) q.type = item.baseType
    return body
  }

  if (item.kind === 'gem') {
    q.type = item.baseType ?? item.name
    const category = gemCategory(item.itemClass)
    if (category) q.filters.type_filters = { filters: { category: { option: category } } }
    if (item.gemLevel) q.filters.misc_filters = { filters: { gem_level: { min: item.gemLevel } } }
    return body
  }

  // rare / magic / normal / currency / divcard → match by base type
  q.type = item.baseType ?? item.name
  if (item.kind === 'rare' || item.kind === 'magic') {
    const filters: NonNullable<TradeSearchBody['query']['filters']['type_filters']>['filters'] = {
      rarity: { option: item.kind === 'magic' ? 'magic' : 'nonunique' }
    }
    if (item.itemLevel) filters.ilvl = { min: Math.max(1, item.itemLevel - 2) }
    q.filters.type_filters = { filters }
  }
  return body
}

// ---------------------------------------------------------------------------
// Price summary
// ---------------------------------------------------------------------------

export interface PriceStat {
  amount: number
  currency: string
}

export interface PriceSummary {
  min?: PriceStat
  median?: PriceStat
  /** listings of the modal currency, cheapest first */
  display: TradeListing[]
}

/**
 * Summarize mixed-currency listings: group by currency, pick the modal currency
 * (tie-break by cheapest), then take min + (lower-)median within that group.
 */
export function summarizeListings(listings: TradeListing[]): PriceSummary {
  const priced = listings.filter((l) => typeof l.amount === 'number' && l.currency)
  if (!priced.length) return { display: [] }

  const groups = new Map<string, TradeListing[]>()
  for (const l of priced) {
    const g = groups.get(l.currency)
    if (g) g.push(l)
    else groups.set(l.currency, [l])
  }

  // Modal currency: most listings, tie-broken by cheapest price, then name
  // (the name tie-break keeps the choice deterministic regardless of input order).
  let best: { currency: string; items: TradeListing[]; cheapest: number } | null = null
  for (const [currency, items] of groups) {
    const cheapest = Math.min(...items.map((i) => i.amount))
    if (
      !best ||
      items.length > best.items.length ||
      (items.length === best.items.length && cheapest < best.cheapest) ||
      (items.length === best.items.length && cheapest === best.cheapest && currency < best.currency)
    ) {
      best = { currency, items, cheapest }
    }
  }

  const sorted = best!.items.slice().sort((a, b) => a.amount - b.amount)
  const n = sorted.length
  return {
    min: { amount: sorted[0].amount, currency: best!.currency },
    median: { amount: sorted[Math.floor((n - 1) / 2)].amount, currency: best!.currency },
    display: sorted
  }
}

/** Drop private/Ruthless leagues from a leagues list. */
export function filterLeagues(ids: string[]): string[] {
  return ids.filter((id) => !!id && !/ruthless/i.test(id) && !/\(PL\d+\)$/.test(id))
}

// ---------------------------------------------------------------------------
// Rate limiter (sliding window, re-synced from GGG's x-rate-limit headers)
// ---------------------------------------------------------------------------

export class RateLimiter {
  private slots: number[] = []
  constructor(
    public max = 1,
    public windowMs = 5000
  ) {}

  /** Block until a slot is free, then claim it. */
  async take(): Promise<void> {
    for (;;) {
      const now = Date.now()
      this.slots = this.slots.filter((t) => t > now)
      if (this.slots.length < this.max) {
        this.slots.push(now + this.windowMs)
        return
      }
      const wait = this.slots[0] - now
      await new Promise((r) => setTimeout(r, Math.max(0, wait) + 50))
    }
  }

  /** Mirror the server's view so we never overshoot its limit. */
  syncFromState(maxAllowed: number, windowSec: number, currentHits: number): void {
    if (maxAllowed > 0) this.max = maxAllowed
    if (windowSec > 0) this.windowMs = windowSec * 1000 + 500
    const now = Date.now()
    while (this.slots.length < currentHits) this.slots.push(now + this.windowMs)
  }
}
