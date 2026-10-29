import { app, ipcMain, clipboard } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import { GAMES, siteUrl, type GameDef, type SiteHost } from '@shared/games'
import type {
  CurrencyRate,
  NetError,
  Poe1ExchangeOffer,
  Poe1ExchangeResult,
  Poe1FallbackMatch,
  Poe1FaustusResult,
  Poe1SearchResult,
  Poe1UnknownLine
} from '@shared/types'
import {
  FETCH_PAGE,
  MAX_FETCH,
  normalizeListing,
  type Poe1Listing,
  type TradeFetchItem
} from '@shared/poe1/pricecheck/results'
import { parseTradeDataStats, TradeStatsFallback, type TradeStatEntry } from '@shared/poe1/pricecheck/fallback'
import { faustusPriceByName, feedIdsByName, lastFeedHour, type FaustusPrice } from '@shared/poe1/pricecheck/faustus'
import type { ExchangeIdNames } from '@shared/wealth/sources'
import * as trade from '../services/tradeClient'
import * as secret from '../services/secretStore'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { getSettings } from '../services/settingsStore'
import { tradeRequest } from '../net'
import { isValidPoesessid } from '../net/guards'
import { captureItemText } from '../input/gameInput'
import { getDivineRate } from './wealth'
import { getFeedStore } from '../games/poe1/exchange/feedService'
import { KEEP_HOURS } from '../games/poe1/exchange/feedStore'
import { resourcesDir } from '../services/questDataset'
import { sendToCompanion } from '../windows/companionWindow'
import { onHotkeyAction } from '../hotkeys'
import type { IpcDomain } from './types'

// Домен «трейд/прайс-чек».
//  - PoE2 (trade2, компас): Ctrl+D → сами копируем предмет (captureItemText) → результат в компаньон.
//  - PoE1 (S4): Ctrl+D ловит overlay-домен (S1) и шлёт предмет в оверлей; окно цены (renderer) парсит
//    его, строит фильтры и тело запроса, а сюда приходит только за сетью: search + fetch / exchange через
//    шлюз S3 (лимиты, fail-fast, кэш 5 мин) и за фолбэком data/stats для модов, которых нет в данных APT.
//  Whisper сами не шлём (риск бана, GGG через мейнтейнеров PoB): только «скопировать текст» по клику.

/** Ctrl+D (PoE2): копируем предмет под курсором; не вышло — то, что игрок скопировал сам. */
async function priceCheckClipboard(): Promise<void> {
  const text = (await captureItemText())?.text ?? clipboard.readText()
  try {
    const result = await trade.priceCheck(text)
    sendToCompanion(IPC.events.priceResult, result)
  } catch (e) {
    // Always settle the renderer's spinner, even on an unexpected throw.
    console.error('[hotkey] price-check error:', e)
    sendToCompanion(IPC.events.priceResult, { status: 'error', message: 'unexpected error' })
  }
}

// ---------------------------------------------------------------- PoE1: поиск и обмен

const MAX_BODY_CHARS = 64 * 1024

function badRequest(message: string): { ok: false; error: NetError } {
  return { ok: false, error: { code: 'bad-request', message } }
}

/** Аргументы от renderer: лига-строка и JSON-тело разумного размера. */
function checkArgs(args: unknown): { league: string; body: unknown; fetch?: unknown } | string {
  if (typeof args !== 'object' || args === null) return 'args'
  const { league, body, fetch } = args as Record<string, unknown>
  if (typeof league !== 'string' || !league || league.length > 100) return 'league'
  if (typeof body !== 'object' || body === null) return 'body'
  if (JSON.stringify(body).length > MAX_BODY_CHARS) return 'body too large'
  return { league, body, fetch }
}

async function host(): Promise<SiteHost> {
  return (await getSettings()).siteHost
}

interface SearchResponse {
  id: string
  result: string[]
  total: number
  inexact?: boolean
}

async function poe1Search(args: unknown): Promise<Poe1SearchResult> {
  const a = checkArgs(args)
  if (typeof a === 'string') return badRequest(a)
  const want = Math.max(1, Math.min(MAX_FETCH, Number(a.fetch) || MAX_FETCH))

  const search = await tradeRequest<SearchResponse>({
    kind: 'search',
    priority: 'interactive',
    req: { method: 'POST', endpoint: 'search', rest: encodeURIComponent(a.league), body: a.body, game: 'poe1' }
  })
  if (!search.ok) return search
  const { id, result, total, inexact } = search.data
  if (typeof id !== 'string' || !Array.isArray(result)) return { ok: false, error: { code: 'bad-response' } }

  const ids = result.slice(0, want)
  const listings: Poe1Listing[] = []
  let cached = search.cached
  for (let i = 0; i < ids.length; i += FETCH_PAGE) {
    const page = ids.slice(i, i + FETCH_PAGE)
    const fetched = await tradeRequest<{ result: Array<TradeFetchItem | null> }>({
      kind: 'fetch',
      priority: 'interactive',
      req: { method: 'GET', endpoint: 'fetch', rest: `${page.join(',')}?query=${encodeURIComponent(id)}`, game: 'poe1' }
    })
    if (!fetched.ok) {
      // первая страница — без неё показывать нечего; вторая — отдаём то, что есть
      if (i === 0) return fetched
      break
    }
    cached = cached && fetched.cached
    for (const r of fetched.data.result ?? []) if (r && typeof r.id === 'string') listings.push(normalizeListing(r))
  }

  return {
    ok: true,
    searchId: id,
    total: Number(total) || 0,
    inexact: Boolean(inexact),
    listings,
    cached,
    siteUrl: siteUrl(GAMES.poe1, await host(), a.league, id)
  }
}

interface ExchangeResponse {
  id: string
  total: number
  result: Record<
    string,
    {
      id: string
      listing: {
        indexed?: string
        whisper?: string
        offers: Array<{ exchange: { currency: string; amount: number }; item: { amount: number; stock: number } }>
        account: { name: string; lastCharacterName?: string; online?: { status?: string } | null }
      }
    }
  >
}

async function poe1Exchange(args: unknown): Promise<Poe1ExchangeResult> {
  const a = checkArgs(args)
  if (typeof a === 'string') return badRequest(a)
  const res = await tradeRequest<ExchangeResponse>({
    kind: 'exchange',
    priority: 'interactive',
    req: { method: 'POST', endpoint: 'exchange', rest: encodeURIComponent(a.league), body: a.body, game: 'poe1' }
  })
  if (!res.ok) return res
  const { id, total, result } = res.data
  if (typeof id !== 'string' || typeof result !== 'object' || result === null) {
    return { ok: false, error: { code: 'bad-response' } }
  }
  const offers: Poe1ExchangeOffer[] = Object.values(result)
    .filter((r) => r?.listing?.offers?.length === 1)
    .map((r) => {
      const o = r.listing.offers[0]
      const online = r.listing.account?.online
      return {
        id: r.id,
        indexed: r.listing.indexed,
        exchangeAmount: o.exchange.amount,
        currency: o.exchange.currency,
        itemAmount: o.item.amount,
        stock: o.item.stock,
        accountName: r.listing.account?.name ?? '',
        characterName: r.listing.account?.lastCharacterName,
        online: online ? (online.status === 'afk' ? 'afk' : 'online') : 'offline',
        whisper: typeof r.listing.whisper === 'string' ? r.listing.whisper : undefined
      } satisfies Poe1ExchangeOffer
    })
    // дешевле за штуку — выше
    .sort((a, b) => a.exchangeAmount / a.itemAmount - b.exchangeAmount / b.itemAmount)
  return {
    ok: true,
    queryId: id,
    total: Number(total) || offers.length,
    offers,
    cached: res.cached,
    siteUrl: siteUrl(GAMES.poe1, await host(), a.league, id, 'exchange')
  }
}

// ---------------------------------------------------------------- PoE1: фолбэк data/stats

type FallbackLang = 'en' | 'ru'
const FALLBACK_HOST: Record<FallbackLang, SiteHost> = { en: 'www.pathofexile.com', ru: 'ru.pathofexile.com' }
const FALLBACK_TTL_MS = 24 * 60 * 60_000
const FALLBACK_START_DELAY_MS = 15_000

interface FallbackCache {
  fetchedAt: number
  entries: TradeStatEntry[]
}

const fallbacks: Partial<Record<FallbackLang, { at: number; matcher: TradeStatsFallback }>> = {}
const fallbackLoading = new Map<FallbackLang, Promise<void>>()
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

function fallbackFile(lang: FallbackLang): string {
  return path.join(app.getPath('userData'), 'cache', `trade-stats-${lang}.json`)
}

/** Загрузить кэш с диска; если устарел (или `force`) — скачать заново через шлюз (фон). */
function ensureFallback(lang: FallbackLang, force = false): Promise<void> {
  const fresh = fallbacks[lang] && Date.now() - fallbacks[lang]!.at < FALLBACK_TTL_MS
  if (fresh && !force) return Promise.resolve()
  let p = fallbackLoading.get(lang)
  if (p) return p
  p = (async () => {
    if (!fallbacks[lang]) {
      const disk = await readJson<FallbackCache | null>(fallbackFile(lang), null)
      if (disk && Array.isArray(disk.entries) && typeof disk.fetchedAt === 'number') {
        fallbacks[lang] = { at: disk.fetchedAt, matcher: new TradeStatsFallback(disk.entries) }
      }
    }
    if (!force && fallbacks[lang] && Date.now() - fallbacks[lang]!.at < FALLBACK_TTL_MS) return
    const res = await tradeRequest<unknown>({
      kind: 'data',
      priority: 'background',
      cache: false,
      req: { method: 'GET', endpoint: 'data/stats', game: 'poe1', host: FALLBACK_HOST[lang] }
    })
    if (!res.ok) {
      console.warn(`[trade] data/stats (${lang}) не обновлены: ${res.error.code}`)
      return
    }
    const entries = parseTradeDataStats(res.data)
    fallbacks[lang] = { at: Date.now(), matcher: new TradeStatsFallback(entries) }
    await writeJsonAtomic(fallbackFile(lang), { fetchedAt: Date.now(), entries } satisfies FallbackCache)
  })()
    .catch((e) => console.warn(`[trade] data/stats (${lang}):`, e instanceof Error ? e.message : e))
    .finally(() => fallbackLoading.delete(lang))
  fallbackLoading.set(lang, p)
  return p
}

function scheduleFallbackRefresh(delayMs: number): void {
  if (fallbackTimer) clearTimeout(fallbackTimer)
  fallbackTimer = setTimeout(() => {
    void Promise.all([ensureFallback('en'), ensureFallback('ru')]).finally(() =>
      scheduleFallbackRefresh(FALLBACK_TTL_MS)
    )
  }, delayMs)
  fallbackTimer.unref?.()
}

async function poe1MatchUnknown(lang: unknown, lines: unknown): Promise<Poe1FallbackMatch[]> {
  if (lang !== 'en' && lang !== 'ru') return []
  if (!Array.isArray(lines)) return []
  const clean: Poe1UnknownLine[] = lines
    .slice(0, 40)
    .filter(
      (l): l is Poe1UnknownLine =>
        typeof l === 'object' && l !== null && typeof l.text === 'string' && typeof l.type === 'string' && l.text.length < 300
    )
  if (!clean.length) return []
  await ensureFallback(lang)
  return fallbacks[lang]?.matcher.matchAll(clean) ?? []
}

// ---------------------------------------------------------------- курс chaos ↔ divine

const RATE_TTL_MS = 10 * 60_000
const rates = new Map<string, { at: number; rate: CurrencyRate | null; pending?: Promise<CurrencyRate | null> }>()

/** Курс для окна цены: сервис цен учёта богатства (S11a), в памяти — 10 минут на лигу. */
function currencyRate(league: unknown): Promise<CurrencyRate | null> {
  if (typeof league !== 'string' || !league || league.length > 100) return Promise.resolve(null)
  const hit = rates.get(league)
  if (hit?.pending) return hit.pending
  if (hit && Date.now() - hit.at < RATE_TTL_MS) return Promise.resolve(hit.rate)
  const pending = getDivineRate(league)
    .then((r) => (r ? { league, ...r } : null))
    .catch((e) => {
      console.warn('[trade] курс chaos/divine:', e instanceof Error ? e.message : e)
      return null
    })
    .then((rate) => {
      // без курса — повторить раньше, через минуту
      rates.set(league, { at: rate ? Date.now() : Date.now() - RATE_TTL_MS + 60_000, rate })
      return rate
    })
  rates.set(league, { at: hit?.at ?? 0, rate: hit?.rate ?? null, pending })
  return pending
}

// ---------------------------------------------------------------- S24: цена у Фаустуса

let feedNames: Promise<Map<string, string[]> | null> | null = null

/** id фида ↔ английское имя: обновлённые данные (userData/data) главнее встроенных; один раз за запуск. */
function loadFeedNames(): Promise<Map<string, string[]> | null> {
  feedNames ??= (async () => {
    for (const base of [path.join(app.getPath('userData'), 'data'), path.join(resourcesDir(), 'data')]) {
      try {
        const raw = JSON.parse(await fs.readFile(path.join(base, 'poe1', 'wealth', 'exchange-ids.json'), 'utf8')) as ExchangeIdNames
        if (raw && raw.version === 1 && raw.names && typeof raw.names === 'object') return feedIdsByName(raw.names)
      } catch {
        // следующий кандидат
      }
    }
    return null
  })()
  return feedNames
}

/**
 * Цена у Фаустуса по почасовому фиду обмена GGG (тот же кэш часов, что у «Богатства» и «Обмена»), курс — тот же,
 * что у плашки в шапке. Сайт трейда не трогаем — лимиты GGG не тратятся.
 */
async function poe1Faustus(args: unknown): Promise<Poe1FaustusResult> {
  if (typeof args !== 'object' || args === null) return { ok: false }
  const { league, names } = args as Record<string, unknown>
  if (typeof league !== 'string' || !league || league.length > 100 || !Array.isArray(names)) return { ok: false }
  const wanted = names.filter((n): n is string => typeof n === 'string' && n.length > 0 && n.length < 200).slice(0, 40)
  try {
    const [byName, rate] = await Promise.all([loadFeedNames(), currencyRate(league)])
    if (!byName || !rate) return { ok: false }
    const feed = getFeedStore()
    await feed.refresh(league)
    const hours = feed.hours(league, KEEP_HOURS)
    const last = lastFeedHour(hours)
    if (last === undefined) return { ok: false }
    const prices: Record<string, FaustusPrice> = {}
    for (const name of wanted) {
      const p = faustusPriceByName(hours, league, byName, name, rate.chaosPerDivine)
      if (p) prices[name] = p
    }
    return { ok: true, chaosPerDivine: rate.chaosPerDivine, lastHour: last * 1000, prices }
  } catch (e) {
    console.warn('[trade] цена у Фаустуса:', e instanceof Error ? e.message : e)
    return { ok: false }
  }
}

// ---------------------------------------------------------------- регистрация

function register(): void {
  ipcMain.handle(IPC.trade.priceCheck, (_e, text: string) => trade.priceCheck(text))
  ipcMain.handle(IPC.trade.setSession, async (_e, poesessid: unknown) => {
    // пусто — забыть ключ; иначе только формат POESESSID (32 hex) — в заголовок Cookie не попадёт ничего другого
    const value = typeof poesessid === 'string' ? poesessid.trim() : ''
    if (value && !isValidPoesessid(value)) return secret.hasSession()
    await secret.setSession(value)
    return secret.hasSession()
  })
  ipcMain.handle(IPC.trade.hasSession, () => secret.hasSession())
  ipcMain.handle(IPC.trade.getLeagues, () => trade.getLeagues())
  ipcMain.handle(IPC.trade.poe1Search, (_e, args: unknown) => poe1Search(args))
  ipcMain.handle(IPC.trade.poe1Exchange, (_e, args: unknown) => poe1Exchange(args))
  ipcMain.handle(IPC.trade.poe1MatchUnknown, (_e, lang: unknown, lines: unknown) => poe1MatchUnknown(lang, lines))
  // одно действие игрока — текст whisper в буфер; отправляет игрок сам
  ipcMain.handle(IPC.trade.currencyRate, (_e, league: unknown) => currencyRate(league))
  ipcMain.handle(IPC.trade.poe1Faustus, (_e, args: unknown) => poe1Faustus(args))
  ipcMain.handle(IPC.trade.copyText, (_e, text: unknown) => {
    if (typeof text !== 'string' || !text || text.length > 2000) return false
    clipboard.writeText(text)
    return true
  })
}

function setupForGame(def: GameDef): void {
  if (def.id === 'poe2') {
    // Ctrl+D: копируем предмет под курсором и проверяем цену. Renderer получает event:hotkey
    // (вкладка + спиннер), затем event:priceResult.
    onHotkeyAction('priceCheck', () => {
      void priceCheckClipboard()
    })
  } else {
    // PoE1: хоткей priceCheck — у overlay-домена (S1); здесь только фолбэк data/stats
    scheduleFallbackRefresh(FALLBACK_START_DELAY_MS)
  }
}

export const tradeDomain: IpcDomain = { register, setupForGame }
