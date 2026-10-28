// POETH (S15): предупреждения окна цены «цена может быть не про ваш предмет» — жёлтые строки под вердиктом.
//
// Только по тому, что уже пришло в ответе search/fetch (новых запросов к сайту нет, лимиты GGG не трогаем).
// Каждая проверка — чистая функция; `priceWarnings` собирает их по важности (сверху — сильнее всего меняет
// цену). Поля лота — `normalizeListing`: связи (`item.sockets[].group`), `corrupted`, Foulborn (`mutated`),
// зачарование (`enchantMods`), продавец, время выставления.
//
// Чего нет и почему: legacy-версию уника по ответу fetch не отличить (флага нет; где у APT есть
// discriminator — поиск и так ищет нужную версию); сравнивать тексты имплицитов нельзя — сайт отдаёт их на
// своём языке, а предмет — на языке клиента.

import { ItemRarity, type ParsedItem } from '../parser'
import { ModifierType } from '../parser/modifiers'
import { FilterTag, type FilterPreset, type StatFilter } from './filters/interfaces'
import type { HonestPrice, Poe1Listing } from './results'

export type WarningKind = 'links' | 'variant' | 'corrupted' | 'broad' | 'fixing' | 'old'

export interface PriceWarning {
  kind: WarningKind
  /** i18n-ключ текста (pc1.warn.*) */
  key: string
  params?: Record<string, string | number>
  /** i18n-ключ пояснения термина — в подсказке «?» */
  help?: string
}

/** Порядок показа: сверху то, что сильнее всего меняет цену. */
export const WARNING_ORDER: readonly WarningKind[] = ['links', 'variant', 'corrupted', 'broad', 'fixing', 'old']
/** Сколько строк видно сразу; остальные — под «Ещё N». */
export const VISIBLE_WARNINGS = 2

/** «у большинства лотов»: доля от выборки */
export const MAJORITY = 0.6
/** меньше лотов с известным значением — не судим */
export const MIN_SAMPLE = 3
/** фильтр связей снят: столько лотов с меньшим числом связей уже портят цену */
export const LINKS_OFF_SHARE = 0.3
/** с 5 связей число связей — отдельная цена; меньше — одна группа «≤4» */
export const LINKS_MATTER = 5
/** накрутка и возраст — по самым дешёвым лотам (они и делают цену) */
export const CHEAP_WINDOW = 10
/** накрутка: нужно хотя бы столько дешёвых лотов */
export const FIXING_MIN_LOTS = 5
/** накрутка: столько продавцов держат долю FIXING_SHARE дешёвых лотов */
export const FIXING_SELLERS = 2
export const FIXING_SHARE = 0.8
/** накрутка: один аккаунт — столько лотов по одной цене */
export const SAME_LOTS = 3
/** старые лоты: дней */
export const OLD_DAYS = 7
const DAY_MS = 24 * 60 * 60_000
/** широкий поиск редкого: свойств не меньше, отмечено не больше */
export const BROAD_MIN_MODS = 4
export const BROAD_MAX_ON = 1

/** Лоты без приманок (выбросы «честной цены») в порядке сайта (по цене). */
export function keptListings(listings: readonly Poe1Listing[], honest?: HonestPrice): Poe1Listing[] {
  const skip = new Set(honest ? [...honest.instant.outliers, ...honest.person.outliers] : [])
  return listings.filter((l) => !skip.has(l.id))
}

function share<T>(list: readonly T[], pred: (v: T) => boolean): number {
  return list.length ? list.filter(pred).length / list.length : 0
}

// ---------------------------------------------------------------- связи

function linkBucket(n: number): number {
  return n >= LINKS_MATTER ? n : LINKS_MATTER - 1
}

function linkLabel(bucket: number): string {
  return bucket >= LINKS_MATTER ? String(bucket) : `≤${LINKS_MATTER - 1}`
}

/**
 * Связи предмета и лотов не совпадают. У предмета без 5–6 связей (`sockets.linked` пуст) — группа «≤4».
 * `filterOff` — игрок снял фильтр «Связи: N» (тогда в выдаче есть предметы с меньшим числом связей).
 */
export function linksWarning(
  item: Pick<ParsedItem, 'sockets'>,
  filterOff: boolean,
  lots: readonly Poe1Listing[]
): PriceWarning | null {
  if (!item.sockets) return null
  const sample = lots.filter((l) => l.links != null)
  if (sample.length < MIN_SAMPLE) return null
  const ours = linkBucket(item.sockets.linked ?? 0)
  const more = sample.filter((l) => linkBucket(l.links!) > ours)
  if (more.length / sample.length >= MAJORITY) {
    // самое частое число связей среди «больше», при равенстве — большее
    const counts = new Map<number, number>()
    for (const l of more) counts.set(linkBucket(l.links!), (counts.get(linkBucket(l.links!)) ?? 0) + 1)
    const theirs = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
    return {
      kind: 'links',
      key: 'pc1.warn.links.more',
      params: { ours: linkLabel(ours), theirs: linkLabel(theirs) },
      help: 'pc1.warn.links.help'
    }
  }
  const fewer = share(sample, (l) => linkBucket(l.links!) < ours)
  if (fewer >= MAJORITY) {
    return { kind: 'links', key: 'pc1.warn.links.fewer', params: { ours: linkLabel(ours) }, help: 'pc1.warn.links.help' }
  }
  if (filterOff && fewer >= LINKS_OFF_SHARE) {
    return { kind: 'links', key: 'pc1.warn.links.off', params: { ours: linkLabel(ours) }, help: 'pc1.warn.links.help' }
  }
  return null
}

// ---------------------------------------------------------------- осквернённость

/** Осквернённость предмета не совпадает с большинством лотов (если у предмета вообще есть такой фильтр). */
export function corruptedWarning(
  item: Pick<ParsedItem, 'isCorrupted'>,
  hasFilter: boolean,
  lots: readonly Poe1Listing[]
): PriceWarning | null {
  if (!hasFilter) return null
  const sample = lots.filter((l) => l.corrupted != null)
  if (sample.length < MIN_SAMPLE) return null
  if (share(sample, (l) => l.corrupted !== item.isCorrupted) < MAJORITY) return null
  return {
    kind: 'corrupted',
    key: item.isCorrupted ? 'pc1.warn.corrupted.yours' : 'pc1.warn.corrupted.theirs',
    help: 'pc1.warn.corrupted.help'
  }
}

// ---------------------------------------------------------------- вариант уника

/** Есть ли у предмета зачарование (лабиринт, помазание…). */
export function hasEnchant(item: Pick<ParsedItem, 'newMods' | 'unknownModifiers'>): boolean {
  return (
    item.newMods.some((m) => m.info.type === ModifierType.Enchant) ||
    item.unknownModifiers.some((m) => m.type === ModifierType.Enchant)
  )
}

/**
 * Другой вариант уника: Foulborn (`mutated` в ответе fetch) или зачарование есть/нет не как у большинства.
 * Только то, что сайт отдаёт явным полем.
 */
export function variantWarning(
  item: Pick<ParsedItem, 'rarity' | 'isFoulborn' | 'newMods' | 'unknownModifiers'>,
  lots: readonly Poe1Listing[]
): PriceWarning | null {
  if (item.rarity !== ItemRarity.Unique) return null
  const foulborn = Boolean(item.isFoulborn)
  const fSample = lots.filter((l) => l.foulborn != null)
  if (fSample.length >= MIN_SAMPLE && share(fSample, (l) => l.foulborn !== foulborn) >= MAJORITY) {
    return {
      kind: 'variant',
      key: foulborn ? 'pc1.warn.foulborn.yours' : 'pc1.warn.foulborn.theirs',
      help: 'pc1.warn.foulborn.help'
    }
  }
  const enchant = hasEnchant(item)
  const eSample = lots.filter((l) => l.enchanted != null)
  if (eSample.length >= MIN_SAMPLE && share(eSample, (l) => l.enchanted !== enchant) >= MAJORITY) {
    return {
      kind: 'variant',
      key: enchant ? 'pc1.warn.enchant.yours' : 'pc1.warn.enchant.theirs',
      help: 'pc1.warn.enchant.help'
    }
  }
  return null
}

// ---------------------------------------------------------------- накрутка

/** Самые дешёвые лоты с ценой (окно CHEAP_WINDOW). */
function cheapest(lots: readonly Poe1Listing[]): Poe1Listing[] {
  return lots.filter((l) => l.price && l.price.amount > 0).slice(0, CHEAP_WINDOW)
}

/** Почти все дешёвые лоты у 1–2 продавцов, или один аккаунт выставил много одинаковых по одной цене. */
export function fixingWarning(lots: readonly Poe1Listing[]): PriceWarning | null {
  const cheap = cheapest(lots).filter((l) => l.accountName)
  if (cheap.length < FIXING_MIN_LOTS) return null
  const byAccount = new Map<string, number>()
  for (const l of cheap) byAccount.set(l.accountName, (byAccount.get(l.accountName) ?? 0) + 1)
  const top = [...byAccount.values()].sort((a, b) => b - a)
  const held = top.slice(0, FIXING_SELLERS).reduce((s, n) => s + n, 0)
  // со схлопыванием по аккаунту (по умолчанию) у каждого продавца один лот — сработает, только если сайт
  // показал лоты без схлопывания (выкуп у торговцев) и цену держат 1–2 продавца
  if (held / cheap.length >= FIXING_SHARE) {
    return { kind: 'fixing', key: 'pc1.warn.fixing.few', params: { lots: held, n: cheap.length }, help: 'pc1.warn.fixing.help' }
  }
  const same = new Map<string, number>()
  for (const l of cheap) {
    const k = `${l.accountName}\u0000${l.price!.amount}\u0000${l.price!.currency}`
    same.set(k, (same.get(k) ?? 0) + 1)
  }
  const most = Math.max(...same.values())
  if (most >= SAME_LOTS) {
    return { kind: 'fixing', key: 'pc1.warn.fixing.same', params: { n: most }, help: 'pc1.warn.fixing.help' }
  }
  return null
}

// ---------------------------------------------------------------- старые лоты

/** Большинство дешёвых лотов висит дольше OLD_DAYS дней — по такой цене, похоже, не покупают. */
export function oldWarning(lots: readonly Poe1Listing[], now: number): PriceWarning | null {
  const ages = cheapest(lots)
    .map((l) => (l.indexed ? Date.parse(l.indexed) : NaN))
    .filter((t) => !Number.isNaN(t))
    .map((t) => now - t)
  if (ages.length < MIN_SAMPLE) return null
  if (share(ages, (a) => a > OLD_DAYS * DAY_MS) < MAJORITY) return null
  return { kind: 'old', key: 'pc1.warn.old', params: { days: OLD_DAYS }, help: 'pc1.warn.old.help' }
}

// ---------------------------------------------------------------- широкий поиск

/** Свойства пресета, которые игрок может отметить (без скрытых, «не», свойств базы). */
function modFilters(preset: Pick<FilterPreset, 'stats'>): StatFilter[] {
  return preset.stats.filter(
    (s): s is StatFilter => !s.group && !s.hidden && !s.not && s.tag !== FilterTag.Property
  )
}

/** Сколько свойств отмечено из скольких (для «поиск слишком широкий»). */
export function checkedMods(preset: Pick<FilterPreset, 'stats'>): { on: number; all: number } {
  const mods = modFilters(preset)
  return { on: mods.filter((f) => !f.disabled).length, all: mods.length }
}

/**
 * Поиск слишком широкий: у редкого игрок снял почти все свойства (меньше, чем было отмечено по умолчанию),
 * или сайт сам добавил похожие (`inexact`). Одна строка на оба случая.
 */
export function broadWarning(args: {
  inexact: boolean
  item: Pick<ParsedItem, 'rarity' | 'isUnidentified'>
  mods?: { on: number; all: number }
  /** сколько было отмечено сразу после Ctrl+D */
  defaultOn?: number
}): PriceWarning | null {
  const { item, mods } = args
  if (
    mods &&
    item.rarity === ItemRarity.Rare &&
    !item.isUnidentified &&
    mods.all >= BROAD_MIN_MODS &&
    mods.on <= BROAD_MAX_ON &&
    mods.on < (args.defaultOn ?? Infinity)
  ) {
    return { kind: 'broad', key: 'pc1.warn.broad.mods', params: { on: mods.on, all: mods.all } }
  }
  if (args.inexact) return { kind: 'broad', key: 'pc1.warn.broad.inexact' }
  return null
}

// ---------------------------------------------------------------- все вместе

/** Что было включено в момент поиска (фильтры мутабельны: правки до «Искать заново» старый результат не меняют). */
export interface SearchContext {
  /** фильтр «Связи: N» есть, но снят */
  linksOff: boolean
  /** у предмета есть фильтр осквернённости (снаряжение, уники, камни) */
  corruptedFilter: boolean
  mods: { on: number; all: number }
}

export function searchContext(preset: Pick<FilterPreset, 'stats' | 'filters'>): SearchContext {
  return {
    linksOff: preset.filters.linkedSockets?.disabled === true,
    corruptedFilter: preset.filters.corrupted != null,
    mods: checkedMods(preset)
  }
}

export interface WarningsInput extends SearchContext {
  item: ParsedItem
  listings: readonly Poe1Listing[]
  honest?: HonestPrice
  inexact: boolean
  /** отмечено свойств сразу после Ctrl+D (store) */
  defaultOn?: number
  now: number
}

/** Предупреждения «выдача про другой предмет»: с ними рекомендованной цене верить нельзя. */
export const STRONG_WARNINGS: ReadonlySet<WarningKind> = new Set<WarningKind>(['links', 'variant', 'corrupted'])

export function hasStrongWarning(ws: readonly PriceWarning[]): boolean {
  return ws.some((w) => STRONG_WARNINGS.has(w.kind))
}

export function priceWarnings(input: WarningsInput): PriceWarning[] {
  const { item } = input
  const lots = keptListings(input.listings, input.honest)
  const found = [
    linksWarning(item, input.linksOff, lots),
    variantWarning(item, lots),
    corruptedWarning(item, input.corruptedFilter, lots),
    broadWarning({ inexact: input.inexact, item, mods: input.mods, defaultOn: input.defaultOn }),
    fixingWarning(lots),
    oldWarning(lots, input.now)
  ].filter((w): w is PriceWarning => w != null)
  return found.sort((a, b) => WARNING_ORDER.indexOf(a.kind) - WARNING_ORDER.indexOf(b.kind))
}
