// История сделок: создание из whisper'а, повторы, статусы, игнор проданного, лимит, фильтры,
// экспорт. Чистые функции — их использует dealsStore (main) и тесты.

import type {
  Deal,
  DealLang,
  DealStatus,
  DealsConfig,
  DealsConfigPatch,
  DealsFilter,
  IgnoredItem,
  ReplyTemplates
} from '../types/deals'
import type { SystemEvent, WhisperEvent } from './whisperParse'

/** 2 — «Показывать исходящие» включено по умолчанию (в файлах версии 1 оно включается один раз). */
export const DEALS_FILE_VERSION = 2

/** Повтор того же сообщения в течение этого времени поднимает старую сделку, а не плодит новую. */
export const REPEAT_WINDOW_MS = 30 * 60_000
/** Сколько помнить проданный предмет (сообщения из кэша поиска приходят ещё долго). */
export const IGNORE_TTL_MS = 24 * 60 * 60_000
/** «Trade accepted» относится к приглашённой сделке не старше этого. */
export const TRADE_ACCEPT_WINDOW_MS = 15 * 60_000

export const HISTORY_LIMITS = [100, 300, 500, 1000] as const
const DEFAULT_HISTORY_LIMIT = 500

export const DEFAULT_TEMPLATES: Record<DealLang, ReplyTemplates> = {
  ru: {
    thanks: 'Спасибо за сделку, удачи!',
    sold: 'Извините, уже продано: {item}.',
    still: 'Здравствуйте! Ещё продаёте {item} за {price}?',
    wait: 'Минуту, скоро приглашу.'
  },
  en: {
    thanks: 'Thanks for the trade, good luck!',
    sold: 'Sorry, {item} is already sold.',
    still: 'Hi! Is {item} for {price} still available?',
    wait: 'One minute please, I will invite you soon.'
  }
}

export function defaultDealsConfig(): DealsConfig {
  return {
    sound: true,
    hideAfterSold: true,
    checkBlacklist: true,
    highlightStash: true,
    showOutgoing: true,
    stashInFolder: false,
    historyLimit: DEFAULT_HISTORY_LIMIT,
    replyLang: 'auto',
    templates: { ru: { ...DEFAULT_TEMPLATES.ru }, en: { ...DEFAULT_TEMPLATES.en } },
    logPath: null
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const BOOL_KEYS = ['sound', 'hideAfterSold', 'checkBlacklist', 'highlightStash', 'showOutgoing', 'stashInFolder'] as const
const TEMPLATE_KEYS: (keyof ReplyTemplates)[] = ['thanks', 'sold', 'still', 'wait']
const MAX_TEMPLATE_LEN = 200

function normTemplates(src: unknown, def: ReplyTemplates): ReplyTemplates {
  const out = { ...def }
  if (!isObj(src)) return out
  for (const k of TEMPLATE_KEYS) {
    const v = src[k]
    // одна строка чата: без переводов строк, не длиннее лимита
    if (typeof v === 'string') out[k] = v.replace(/[\r\n]+/g, ' ').slice(0, MAX_TEMPLATE_LEN)
  }
  return out
}

/** Любые данные → валидный DealsConfig (поле за полем, мусор → дефолт). */
export function normalizeDealsConfig(raw: unknown): DealsConfig {
  const def = defaultDealsConfig()
  if (!isObj(raw)) return def
  const out: DealsConfig = { ...def }
  for (const k of BOOL_KEYS) if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean
  if (typeof raw.historyLimit === 'number' && Number.isFinite(raw.historyLimit)) {
    out.historyLimit = Math.min(5000, Math.max(20, Math.round(raw.historyLimit)))
  }
  if (raw.replyLang === 'auto' || raw.replyLang === 'ru' || raw.replyLang === 'en') out.replyLang = raw.replyLang
  if (typeof raw.logPath === 'string' && raw.logPath.trim()) out.logPath = raw.logPath
  const t = isObj(raw.templates) ? raw.templates : {}
  out.templates = { ru: normTemplates(t.ru, def.templates.ru), en: normTemplates(t.en, def.templates.en) }
  return out
}

/** Патч настроек: шаблоны сливаются по языку и ключу, затем normalize. */
export function applyDealsConfigPatch(cur: DealsConfig, patch: DealsConfigPatch): DealsConfig {
  const { templates, ...rest } = patch
  const merged: Obj = { ...cur, ...rest }
  merged.templates = {
    ru: { ...cur.templates.ru, ...(templates?.ru ?? {}) },
    en: { ...cur.templates.en, ...(templates?.en ?? {}) }
  }
  return normalizeDealsConfig(merged)
}

// ---------------------------------------------------------------------------
// Файл deals.json
// ---------------------------------------------------------------------------

export interface DealsFileData {
  version: number
  deals: Deal[]
  ignored: IgnoredItem[]
  /** имена вкладок, которые встречались с позицией > 12 (quad 24×24), нижний регистр */
  quadTabs: string[]
  config: DealsConfig
}

/** Сколько имён quad-вкладок помнить. */
export const QUAD_TABS_LIMIT = 50

export function emptyDealsFile(): DealsFileData {
  return { version: DEALS_FILE_VERSION, deals: [], ignored: [], quadTabs: [], config: defaultDealsConfig() }
}

const STATUSES: DealStatus[] = ['new', 'invited', 'traded', 'sold', 'ignored']

function isDeal(v: unknown): v is Deal {
  if (!isObj(v)) return false
  return (
    typeof v.id === 'string' &&
    (v.dir === 'in' || v.dir === 'out') &&
    typeof v.player === 'string' &&
    typeof v.item === 'string' &&
    typeof v.price === 'string' &&
    typeof v.league === 'string' &&
    typeof v.ts === 'number' &&
    STATUSES.includes(v.status as DealStatus)
  )
}

/** Прочитанный deals.json (или мусор) → валидные данные; просроченный игнор отбрасывается. */
export function normalizeDealsFile(raw: unknown, now: number): DealsFileData {
  if (!isObj(raw)) return emptyDealsFile()
  const config = normalizeDealsConfig(raw.config)
  // до версии 2 исходящие были выключены по умолчанию — карточка после @To не появлялась
  if (!(typeof raw.version === 'number' && raw.version >= 2)) config.showOutgoing = true
  const deals = (Array.isArray(raw.deals) ? raw.deals : []).filter(isDeal).map((d) => ({
    ...d,
    bulk: d.bulk === true,
    lang: (d.lang === 'ru' ? 'ru' : 'en') as DealLang
  }))
  const ignored = (Array.isArray(raw.ignored) ? raw.ignored : []).filter(
    (x): x is IgnoredItem =>
      isObj(x) && typeof x.key === 'string' && typeof x.item === 'string' && typeof x.ts === 'number'
  )
  const quadTabs = (Array.isArray(raw.quadTabs) ? raw.quadTabs : [])
    .filter((x): x is string => typeof x === 'string')
    .slice(0, QUAD_TABS_LIMIT)
  return {
    version: DEALS_FILE_VERSION,
    deals: trimHistory(sortNewestFirst(deals), config.historyLimit),
    ignored: pruneIgnored(ignored, now),
    quadTabs,
    config
  }
}

// ---------------------------------------------------------------------------
// Сделка из whisper'а
// ---------------------------------------------------------------------------

/** Whisper с шаблоном трейда → новая сделка (без проверки игнора/повтора), иначе null. */
export function dealFromWhisper(ev: WhisperEvent, id: string, now: number): Deal | null {
  const t = ev.trade
  if (!t || !ev.player) return null
  const deal: Deal = {
    id,
    dir: ev.dir,
    player: ev.player,
    item: t.item,
    price: t.price,
    league: t.league,
    bulk: t.kind === 'bulk',
    lang: t.lang,
    ts: ev.ts ?? now,
    status: 'new',
    raw: ev.body
  }
  if (ev.guild) deal.guild = ev.guild
  if (t.itemAmount !== undefined) deal.itemAmount = t.itemAmount
  if (t.gem) deal.gem = t.gem
  if (t.priceValue) deal.priceValue = t.priceValue
  if (t.tab !== undefined) deal.tab = t.tab
  if (t.pos) deal.pos = t.pos
  if (t.message) deal.message = t.message
  return deal
}

/** Ключ предмета для игнора: имя (+ камень/количество) + вкладка + позиция. */
export function ignoreKey(d: Pick<Deal, 'item' | 'tab' | 'pos' | 'gem' | 'itemAmount'>): string {
  const gem = d.gem ? `|g${d.gem.level}/${d.gem.quality}` : ''
  const amount = d.itemAmount !== undefined ? `|x${d.itemAmount}` : ''
  const pos = d.pos ? `|${d.pos.left},${d.pos.top}` : ''
  return `${d.item.toLowerCase()}${gem}${amount}|${(d.tab ?? '').toLowerCase()}${pos}`
}

function sameRequest(a: Deal, b: Deal): boolean {
  return a.dir === b.dir && a.player === b.player && a.price === b.price && ignoreKey(a) === ignoreKey(b)
}

export function pruneIgnored(list: IgnoredItem[], now: number): IgnoredItem[] {
  return list.filter((x) => now - x.ts < IGNORE_TTL_MS)
}

export function isIgnored(list: IgnoredItem[], deal: Deal, now: number): boolean {
  const key = ignoreKey(deal)
  return list.some((x) => x.key === key && now - x.ts < IGNORE_TTL_MS)
}

function sortNewestFirst(deals: Deal[]): Deal[] {
  return [...deals].sort((a, b) => b.ts - a.ts)
}

/** Оставить `limit` самых новых. */
export function trimHistory(deals: Deal[], limit: number): Deal[] {
  return deals.length > limit ? deals.slice(0, limit) : deals
}

export type AddDealResult =
  | { kind: 'added'; deal: Deal; data: DealsFileData }
  /** тот же запрос недавно — старая сделка поднята наверх с новым временем */
  | { kind: 'repeated'; deal: Deal; data: DealsFileData }

/**
 * Добавить сделку в историю: повтор того же запроса (тот же игрок, предмет, цена, ячейка)
 * в окне REPEAT_WINDOW_MS поднимает существующую; входящая по проданному предмету сразу
 * получает статус ignored.
 */
export function addDeal(data: DealsFileData, deal: Deal, now: number): AddDealResult {
  const prev = data.deals.find(
    (d) => sameRequest(d, deal) && deal.ts - d.ts < REPEAT_WINDOW_MS && d.status !== 'sold'
  )
  if (prev) {
    const bumped: Deal = { ...prev, ts: Math.max(prev.ts, deal.ts), raw: deal.raw ?? prev.raw }
    if (deal.message) bumped.message = deal.message
    const deals = sortNewestFirst(data.deals.map((d) => (d.id === prev.id ? bumped : d)))
    return { kind: 'repeated', deal: bumped, data: { ...data, deals } }
  }
  const next: Deal =
    deal.dir === 'in' && isIgnored(data.ignored, deal, now) ? { ...deal, status: 'ignored' } : deal
  const deals = trimHistory(sortNewestFirst([next, ...data.deals]), data.config.historyLimit)
  return { kind: 'added', deal: next, data: { ...data, deals, quadTabs: rememberQuadTab(data.quadTabs, next) } }
}

/** Позиция > 12 у входящей — вкладка квадратная, запоминаем её имя. */
export function rememberQuadTab(list: string[], deal: Pick<Deal, 'dir' | 'tab' | 'pos'>): string[] {
  if (deal.dir !== 'in' || deal.tab === undefined || !deal.pos) return list
  if (deal.pos.left <= 12 && deal.pos.top <= 12) return list
  const name = deal.tab.toLowerCase()
  return list.includes(name) ? list : [name, ...list].slice(0, QUAD_TABS_LIMIT)
}

export function isKnownQuadTab(list: string[], tab: string | undefined): boolean {
  return tab !== undefined && list.includes(tab.toLowerCase())
}

/** Сменить статус; «продано» у входящей кладёт предмет в игнор. */
export function setDealStatus(data: DealsFileData, id: string, status: DealStatus, now: number): DealsFileData {
  const deal = data.deals.find((d) => d.id === id)
  if (!deal) return data
  const deals = data.deals.map((d) => (d.id === id ? { ...d, status, updatedAt: now } : d))
  let ignored = data.ignored
  if (status === 'sold' && deal.dir === 'in') {
    const key = ignoreKey(deal)
    ignored = [{ key, item: deal.item, ts: now }, ...pruneIgnored(ignored, now).filter((x) => x.key !== key)]
  }
  return { ...data, deals, ignored }
}

/** Закрыть/вернуть карточку поверх игры (сделка в истории остаётся). */
export function setCardHidden(data: DealsFileData, id: string, hidden: boolean): DealsFileData {
  if (!data.deals.some((d) => d.id === id)) return data
  return { ...data, deals: data.deals.map((d) => (d.id === id ? { ...d, cardHidden: hidden || undefined } : d)) }
}

export function removeDeal(data: DealsFileData, id: string): DealsFileData {
  return { ...data, deals: data.deals.filter((d) => d.id !== id) }
}

/**
 * Очистить историю. demoOnly — убрать только примеры (и их «проданные» из игнора);
 * при полной очистке игнор проданного сохраняется: сообщения про проданное ещё придут.
 */
export function clearDeals(data: DealsFileData, demoOnly = false): DealsFileData {
  if (!demoOnly) return { ...data, deals: [] }
  const demoKeys = new Set(data.deals.filter((d) => d.demo).map(ignoreKey))
  const realKeys = new Set(data.deals.filter((d) => !d.demo).map(ignoreKey))
  return {
    ...data,
    deals: data.deals.filter((d) => !d.demo),
    ignored: data.ignored.filter((x) => !demoKeys.has(x.key) || realKeys.has(x.key))
  }
}

/** Новый лимит истории применяется сразу. */
export function withConfig(data: DealsFileData, config: DealsConfig): DealsFileData {
  return { ...data, config, deals: trimHistory(data.deals, config.historyLimit) }
}

/**
 * Системное событие → правка истории. Сейчас только «Trade accepted»: последняя приглашённая
 * (или новая) сделка не старше TRADE_ACCEPT_WINDOW_MS становится traded. Возвращает id
 * изменённой сделки.
 */
export function applySystemEvent(
  data: DealsFileData,
  ev: SystemEvent,
  now: number
): { data: DealsFileData; changedId: string | null } {
  if (ev.kind !== 'tradeAccepted') return { data, changedId: null }
  const pick =
    data.deals.find((d) => d.status === 'invited' && now - (d.updatedAt ?? d.ts) < TRADE_ACCEPT_WINDOW_MS) ?? null
  if (!pick) return { data, changedId: null }
  return { data: setDealStatus(data, pick.id, 'traded', now), changedId: pick.id }
}

// ---------------------------------------------------------------------------
// Фильтры и экспорт
// ---------------------------------------------------------------------------

export function filterDeals(deals: Deal[], filter: DealsFilter, query = ''): Deal[] {
  const q = query.trim().toLowerCase()
  return deals.filter((d) => {
    if (filter === 'in' && d.dir !== 'in') return false
    if (filter === 'out' && d.dir !== 'out') return false
    if (filter === 'sold' && d.status !== 'sold' && d.status !== 'traded') return false
    if (!q) return true
    return d.player.toLowerCase().includes(q) || d.item.toLowerCase().includes(q)
  })
}

const CSV_COLUMNS: (keyof Deal | 'date' | 'left' | 'top')[] = [
  'date',
  'dir',
  'status',
  'player',
  'item',
  'itemAmount',
  'price',
  'league',
  'tab',
  'left',
  'top',
  'message'
]

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function isoLocal(ts: number): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** История → CSV (UTF-8 с BOM — Excel открывает кириллицу правильно). */
export function dealsToCsv(deals: Deal[]): string {
  const rows = [CSV_COLUMNS.join(',')]
  for (const d of deals) {
    const row = CSV_COLUMNS.map((c) => {
      if (c === 'date') return isoLocal(d.ts)
      if (c === 'left') return d.pos?.left
      if (c === 'top') return d.pos?.top
      return d[c]
    })
    rows.push(row.map(csvCell).join(','))
  }
  return '﻿' + rows.join('\r\n') + '\r\n'
}
