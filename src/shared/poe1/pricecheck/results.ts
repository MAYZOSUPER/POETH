// POETH: результаты поиска трейда PoE1 — нормализация ответа /api/trade/fetch и «честная цена».
//
// «Честная цена» (для новичков): лоты мгновенного выкупа (мерчант, `listing.fee` — комиссия в золоте, без
// whisper) и лоты «лично» (whisper, продавец может не ответить) считаются отдельно: минимум и медиана по каждой
// группе. Одиночные выбросы-приманки в начале списка отсеиваются: цена ниже 0.5× медианы следующих 5 лотов.
// Сайт сортирует по цене в своей нормализации валют, поэтому медиана берётся по позиции; сравнение цен для
// выбросов — в одной валюте или по курсам `rates` (chaos-эквивалент), если они известны.

import type { NetError } from '../../types/auth'

export type Poe1ListingKind = 'instant' | 'person'

/** Редкость лота по `item.frameType` (relic — «фольговый» уник, на трейде своя редкость). */
export type Poe1LotRarity = 'normal' | 'magic' | 'rare' | 'unique' | 'relic' | 'gem' | 'currency' | 'card' | 'other'

/** Откуда мод лота (домен сайта): explicit, implicit, crafted, fractured, enchant… */
export type LotModKind = 'enchant' | 'scourge' | 'implicit' | 'fractured' | 'explicit' | 'crafted' | 'veiled' | 'other'

/** S21: мод предмета лота — текст на языке сайта и stat id трейда (по нему сравниваем с предметом игрока). */
export interface LotMod {
  kind: LotModKind
  text: string
  /** «explicit.stat_3299347043» — как id фильтров запроса; нет у модов без привязки к стату */
  stat?: string
}

export interface Poe1Price {
  amount: number
  currency: string
}

export interface Poe1Listing {
  id: string
  /** instant — мерчант-листинг (покупка на сайте за золото), person — продавец в игре (whisper) */
  kind: Poe1ListingKind
  price: Poe1Price | null
  /** ISO-время выставления */
  indexed?: string
  /** комиссия мерчанта в золоте */
  fee?: number
  accountName: string
  characterName?: string
  online: 'online' | 'afk' | 'offline'
  /** готовый текст whisper от сайта (у in-person) — игрок копирует его сам */
  whisper?: string
  itemLevel?: number
  /** осквернён ли лот (сайт пишет `corrupted` только при true); нет `item` в ответе — undefined */
  corrupted?: boolean
  /** имя и база предмета на языке сайта — «Купить» открывает этот лот в трейд-окне (S5, {lot}) */
  itemName?: string
  baseType?: string
  /** S15: самая длинная группа связанных гнёзд (`item.sockets[].group`); гнёзд нет — undefined */
  links?: number
  /** S15: Foulborn-версия уника (`item.mutated`) */
  foulborn?: boolean
  /** S15: есть зачарование (`item.enchantMods`) — лабиринт, помазание и т.п. */
  enchanted?: boolean
  /** S21: редкость (фильтр редкости в «Открыть лот») */
  rarity?: Poe1LotRarity
  /** S21: моды предмета для карточки «что продаёт и похоже ли на ваш» — из того же ответа fetch */
  mods?: LotMod[]
  /** S21: гнёзда как в игре: «R-G-B B» (связанные — через дефис) */
  sockets?: string
  /** S21: предмет не опознан (модов не видно) */
  unidentified?: boolean
}

/** Сырой элемент ответа /api/trade/fetch (только используемые поля). */
export interface TradeFetchItem {
  id: string
  listing?: {
    indexed?: string
    price?: { amount?: number; currency?: string; type?: string } | null
    fee?: number | null
    whisper?: string | null
    account?: { name?: string; lastCharacterName?: string; online?: { status?: string } | null } | null
  }
  item?: {
    ilvl?: number
    corrupted?: boolean
    identified?: boolean
    name?: string
    typeLine?: string
    baseType?: string
    frameType?: number
    sockets?: Array<{ group?: number; sColour?: string; attr?: string } | null> | null
    /** PoE1: true у Foulborn-уников (документация GGG, тип Item) */
    mutated?: boolean
    /**
     * Моды: строки (классический ответ, stat id — в `extended.hashes[<домен>][i][0]` по порядку) или, как
     * сейчас отдаёт сайт (проверено 29.10.2026), объекты `{description, domain, hash: 'stat.explicit.stat_…'}`;
     * в `explicitMods` тогда и fractured, и crafted (по `domain`).
     */
    enchantMods?: SiteMod[] | null
    scourgeMods?: SiteMod[] | null
    implicitMods?: SiteMod[] | null
    fracturedMods?: SiteMod[] | null
    explicitMods?: SiteMod[] | null
    craftedMods?: SiteMod[] | null
    veiledMods?: SiteMod[] | null
    extended?: { hashes?: Record<string, Array<[string, unknown]> | null> | null } | null
  }
}

type SiteMod = string | { description?: string; domain?: string; hash?: string } | null

/** Самая длинная группа связей: гнёзда с одинаковым `group` связаны между собой. */
function linksOf(sockets: unknown): number | undefined {
  if (!Array.isArray(sockets) || !sockets.length) return undefined
  const groups = new Map<number, number>()
  for (const s of sockets) {
    const g = (s as { group?: unknown } | null)?.group
    if (typeof g === 'number') groups.set(g, (groups.get(g) ?? 0) + 1)
  }
  return groups.size ? Math.max(...groups.values()) : undefined
}

/** Текст предмета от сайта без разметки вида <<set:MS>>; пусто — undefined. */
function siteText(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined
  const v = s.replace(/<<[^>]*>>/g, '').trim()
  return v || undefined
}

const FRAME: Record<number, Poe1LotRarity> = { 0: 'normal', 1: 'magic', 2: 'rare', 3: 'unique', 4: 'gem', 5: 'currency', 6: 'card', 9: 'relic' }

/** Поля модов в порядке, как их показывает игра. */
const MOD_FIELDS = [
  ['enchantMods', 'enchant'],
  ['scourgeMods', 'scourge'],
  ['implicitMods', 'implicit'],
  ['fracturedMods', 'fractured'],
  ['explicitMods', 'explicit'],
  ['craftedMods', 'crafted'],
  ['veiledMods', 'veiled']
] as const

const MOD_KINDS = new Set<string>(MOD_FIELDS.map(([, k]) => k))
/** Сколько модов держим на лот (карточка, сравнение) — защита от странного ответа. */
const MAX_MODS = 40

/** Текст мода: без разметки сайта (<<set:MS>>, [Тег|Подпись] → Подпись). */
function modText(s: unknown): string | undefined {
  return siteText(s)
    ?.replace(/\[([^\]|]*)\|([^\]]*)\]/g, '$2')
    .replace(/\[([^\]]*)\]/g, '$1')
    .slice(0, 200)
}

/** Моды лота с stat id: из `hash` мода, иначе по порядку из `extended.hashes` того же домена. */
function modsOf(item: NonNullable<TradeFetchItem['item']>): LotMod[] {
  const hashes = item.extended?.hashes ?? {}
  const seen: Record<string, number> = {}
  const out: LotMod[] = []
  for (const [field, fieldKind] of MOD_FIELDS) {
    const list = item[field]
    if (!Array.isArray(list)) continue
    for (const m of list) {
      const obj = typeof m === 'object' && m !== null ? m : null
      const text = modText(obj ? obj.description : m)
      if (!text) continue
      const domain = typeof obj?.domain === 'string' && obj.domain ? obj.domain : fieldKind
      const i = (seen[domain] = (seen[domain] ?? -1) + 1)
      const fromList = hashes?.[domain]?.[i]?.[0]
      const hash = typeof obj?.hash === 'string' && obj.hash ? obj.hash.replace(/^stat\./, '') : fromList
      const kind = (MOD_KINDS.has(domain) ? domain : 'other') as LotModKind
      out.push(typeof hash === 'string' && hash ? { kind, text, stat: hash } : { kind, text })
      if (out.length >= MAX_MODS) return out
    }
  }
  return out
}

/** Гнёзда как в игре: связанные через дефис, группы через пробел («R-G-B B»). */
const ATTR_COLOUR: Record<string, string> = { S: 'R', D: 'G', I: 'B', G: 'W', A: 'A', DV: 'DV' }
function socketsText(sockets: unknown): string | undefined {
  if (!Array.isArray(sockets) || !sockets.length) return undefined
  let out = ''
  let group: unknown
  for (const s of sockets as Array<{ group?: unknown; sColour?: unknown; attr?: unknown } | null>) {
    if (!s) continue
    const colour = typeof s.sColour === 'string' ? s.sColour : ATTR_COLOUR[String(s.attr)]
    if (!colour) continue
    out += out ? (s.group === group ? '-' : ' ') : ''
    out += colour
    group = s.group
  }
  return out || undefined
}

export function normalizeListing(r: TradeFetchItem): Poe1Listing {
  const l = r.listing ?? {}
  const fee = typeof l.fee === 'number' ? l.fee : undefined
  const price =
    l.price && typeof l.price.amount === 'number' && typeof l.price.currency === 'string'
      ? { amount: l.price.amount, currency: l.price.currency }
      : null
  const status = l.account?.online ? (l.account.online.status === 'afk' ? 'afk' : 'online') : 'offline'
  const item = r.item
  return {
    id: r.id,
    kind: fee != null ? 'instant' : 'person',
    price,
    indexed: l.indexed,
    fee,
    accountName: l.account?.name ?? '',
    characterName: l.account?.lastCharacterName,
    // мерчант-листинг доступен всегда (как у APT)
    online: fee != null ? 'online' : status,
    whisper: typeof l.whisper === 'string' && l.whisper ? l.whisper : undefined,
    itemLevel: item?.ilvl,
    // флаги сайт пишет только со значением true: есть предмет без флага — значит false
    corrupted: item ? item.corrupted === true : undefined,
    itemName: siteText(item?.name),
    // у магических typeLine с аффиксами — для запроса лота нужна база
    baseType: siteText(item?.baseType) ?? siteText(item?.typeLine),
    links: linksOf(item?.sockets),
    foulborn: item ? item.mutated === true : undefined,
    enchanted: item ? Array.isArray(item.enchantMods) && item.enchantMods.length > 0 : undefined,
    ...(item ? lotItem(item) : {})
  }
}

/** S21: поля карточки лота — редкость, моды с stat id, гнёзда, «не опознан». */
function lotItem(item: NonNullable<TradeFetchItem['item']>): Pick<Poe1Listing, 'rarity' | 'mods' | 'sockets' | 'unidentified'> {
  const out: Pick<Poe1Listing, 'rarity' | 'mods' | 'sockets' | 'unidentified'> = { mods: modsOf(item) }
  if (typeof item.frameType === 'number') out.rarity = FRAME[item.frameType] ?? 'other'
  const sockets = socketsText(item.sockets)
  if (sockets) out.sockets = sockets
  if (item.identified === false) out.unidentified = true
  return out
}

export interface PriceGroupSummary {
  /** лотов с ценой (без выбросов) */
  count: number
  min?: Poe1Price
  median?: Poe1Price
  /** id отброшенных лотов-приманок */
  outliers: string[]
}

export interface HonestPrice {
  instant: PriceGroupSummary
  person: PriceGroupSummary
  /** 0…4 — насколько можно верить цене (по числу похожих лотов) */
  confidence: number
}

export const OUTLIER_RATIO = 0.5
export const OUTLIER_WINDOW = 5

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Цена в сравнимых единицах: по курсу (chaos-эквивалент) или «как есть» в базовой валюте. */
function comparable(p: Poe1Price, base: string, rates?: Readonly<Record<string, number>>): number | undefined {
  const rate = rates?.[p.currency]
  if (rate != null && rates?.[base] != null) return p.amount * rate
  return p.currency === base ? p.amount : undefined
}

export function summarizeGroup(
  listings: readonly Poe1Listing[],
  rates?: Readonly<Record<string, number>>
): PriceGroupSummary {
  const priced = listings.filter((l): l is Poe1Listing & { price: Poe1Price } => l.price != null && l.price.amount > 0)
  const outliers: string[] = []
  let start = 0
  // отсеиваем только ведущие лоты: дальше по сортировке сайта цены и так не ниже
  while (start < priced.length) {
    const next = priced.slice(start + 1, start + 1 + OUTLIER_WINDOW)
    if (next.length < 3) break
    const base = priced[start].price.currency
    const values = next.map((l) => comparable(l.price, base, rates))
    if (values.some((v) => v === undefined)) break
    const own = comparable(priced[start].price, base, rates)!
    if (own < OUTLIER_RATIO * median(values as number[])) {
      outliers.push(priced[start].id)
      start++
    } else {
      break
    }
  }
  const kept = priced.slice(start)
  return {
    count: kept.length,
    min: kept[0]?.price,
    median: kept.length ? kept[(kept.length - 1) >> 1].price : undefined,
    outliers
  }
}

export function confidenceOf(similar: number): number {
  if (similar >= 20) return 4
  if (similar >= 10) return 3
  if (similar >= 5) return 2
  if (similar >= 1) return 1
  return 0
}

/** Сводка по двум группам; `total` — сколько всего нашёл сайт (для точности). */
export function honestPrice(
  listings: readonly Poe1Listing[],
  total = listings.length,
  rates?: Readonly<Record<string, number>>
): HonestPrice {
  const instant = summarizeGroup(
    listings.filter((l) => l.kind === 'instant'),
    rates
  )
  const person = summarizeGroup(
    listings.filter((l) => l.kind === 'person'),
    rates
  )
  return { instant, person, confidence: confidenceOf(Math.max(total, instant.count + person.count)) }
}

// ---------------------------------------------------------------- S24: цена на рынке

/** Сколько самых дешёвых честных лотов берём для «цены на рынке». */
export const MARKET_WINDOW = 10

/**
 * «Цена на рынке» — ответ на вопрос «сколько стоит моя вещь»: середина (медиана) самых дешёвых честных лотов
 * обеих групп вместе (без приманок), в chaos по курсам `rates`. Лоты в валюте без курса не считаем; курса нет
 * ни у одного — всё в валюте самого дешёвого лота. `instant`/`person` — самые дешёвые в группах (для пояснения).
 */
export interface MarketPrice {
  /** середина самых дешёвых лотов: chaos, если курсы известны */
  mid: Poe1Price
  /** самый дешёвый и самый дорогой из этих лотов — в той же валюте */
  min: Poe1Price
  max: Poe1Price
  /** по скольким лотам */
  lots: number
  /** chaos-эквивалент `mid` (курсы известны) */
  chaos?: number
  /** самые дешёвые лоты групп как есть: мгновенный выкуп у торговца / лично (whisper) */
  instant?: Poe1Price
  person?: Poe1Price
}

function chaosValue(p: Poe1Price, rates?: Readonly<Record<string, number>>): number | undefined {
  if (p.currency === 'chaos') return p.amount
  const r = rates?.[p.currency]
  return r != null && r > 0 ? p.amount * r : undefined
}

export function marketPrice(
  listings: readonly Poe1Listing[],
  honest: HonestPrice,
  rates?: Readonly<Record<string, number>>
): MarketPrice | undefined {
  const skip = new Set([...honest.instant.outliers, ...honest.person.outliers])
  const priced = listings.filter((l): l is Poe1Listing & { price: Poe1Price } => !skip.has(l.id) && l.price != null && l.price.amount > 0)
  if (!priced.length) return undefined
  const inChaos = priced.map((l) => chaosValue(l.price, rates)).filter((v): v is number => v != null)
  const currency = inChaos.length ? 'chaos' : priced[0].price.currency
  const values = (inChaos.length ? inChaos : priced.filter((l) => l.price.currency === currency).map((l) => l.price.amount))
    .sort((a, b) => a - b)
    .slice(0, MARKET_WINDOW)
  const mid = median(values)
  return {
    mid: { amount: mid, currency },
    min: { amount: values[0], currency },
    max: { amount: values[values.length - 1], currency },
    lots: values.length,
    ...(currency === 'chaos' ? { chaos: mid } : {}),
    ...(honest.instant.min ? { instant: honest.instant.min } : {}),
    ...(honest.person.min ? { person: honest.person.min } : {})
  }
}

// ---------------------------------------------------------------- IPC (renderer ↔ main)

export interface Poe1SearchArgs {
  league: string
  /** тело POST /api/trade/search (createTradeRequest) */
  body: unknown
  /** сколько лотов загрузить (по 10 за запрос fetch, максимум 20) */
  fetch?: number
}

export type Poe1SearchResult =
  | {
      ok: true
      searchId: string
      total: number
      inexact: boolean
      listings: Poe1Listing[]
      cached: boolean
      /** страница этого поиска на сайте трейда */
      siteUrl: string
    }
  | { ok: false; error: NetError }

export interface Poe1ExchangeArgs {
  league: string
  /** тело POST /api/trade/exchange (createBulkRequest) */
  body: unknown
}

export interface Poe1ExchangeOffer {
  id: string
  indexed?: string
  /** сколько валюты `currency` за `itemAmount` предметов */
  exchangeAmount: number
  currency: string
  itemAmount: number
  stock: number
  accountName: string
  characterName?: string
  online: 'online' | 'afk' | 'offline'
  whisper?: string
}

export type Poe1ExchangeResult =
  | { ok: true; queryId: string; total: number; offers: Poe1ExchangeOffer[]; cached: boolean; siteUrl: string }
  | { ok: false; error: NetError }

export const MAX_FETCH = 20
export const FETCH_PAGE = 10
