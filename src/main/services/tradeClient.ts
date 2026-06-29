import { app, net } from 'electron'
import type { PriceCheckResult, PriceResult, TradeListing, UiLang } from '@shared/types'
import { getSession } from './secretStore'
import { getSettings } from './settingsStore'
import {
  parseItem,
  buildSearchBody,
  summarizeListings,
  searchLabel,
  filterLeagues,
  RateLimiter,
  type ParsedItem
} from './tradeCore'

// PoE2 trade2 price-check client. Runs in the MAIN process and talks to the
// official trade API via Electron net.request — the only way past Cloudflare
// (Chromium TLS stack) and CORS, and the only place we may set the Cookie /
// User-Agent headers. POESESSID is attached explicitly (it lives in safeStorage,
// not the Electron cookie jar). API paths carry NO ?realm=poe2 — the `trade2`
// path segment already targets PoE2. See the verified spec in the price-check plan.

const HOST = 'https://www.pathofexile.com'
const FALLBACK_LEAGUES = ['Standard', 'Hardcore']
const FETCH_BATCH = 10
const MAX_FETCH = 20 // two pages — enough for a min/median, polite on the API
const DBG = process.env.OVERLAY_DEBUG === '1'

const searchLimiter = new RateLimiter(1, 5000)
const fetchLimiter = new RateLimiter(1, 5000)

// Serialize all trade work so two rapid hotkey presses don't race the limiters.
let chain: Promise<unknown> = Promise.resolve()
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  // Run fn after the previous job settles (either outcome), and keep the chain
  // continuation independent of fn's result so a rejection never breaks the queue.
  const run = chain.then(fn, fn)
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run as Promise<T>
}

interface NetResponse {
  status: number
  headers: Record<string, string | string[]>
  body: string
}

function request(opts: {
  url: string
  method: 'GET' | 'POST'
  poesessid: string | null
  jsonBody?: unknown
}): Promise<NetResponse> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url: opts.url, method: opts.method })
    req.setHeader('User-Agent', app.userAgentFallback)
    req.setHeader('Accept', 'application/json')
    if (opts.poesessid) req.setHeader('Cookie', `POESESSID=${opts.poesessid}`)
    if (opts.jsonBody !== undefined) req.setHeader('Content-Type', 'application/json')
    req.on('response', (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(Buffer.from(c)))
      res.on('end', () =>
        resolve({
          status: res.statusCode,
          headers: res.headers as Record<string, string | string[]>,
          body: Buffer.concat(chunks).toString('utf8')
        })
      )
      res.on('error', reject)
    })
    req.on('error', reject)
    if (opts.jsonBody !== undefined) req.write(JSON.stringify(opts.jsonBody))
    req.end()
  })
}

function header(res: NetResponse, name: string): string | undefined {
  const v = res.headers[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Re-sync a limiter from GGG's x-rate-limit headers (strictest rule wins). */
function applyRateHeaders(res: NetResponse, limiter: RateLimiter): void {
  const rules = header(res, 'x-rate-limit-rules')
  if (!rules) return
  for (const rule of rules.split(',')) {
    const limitsH = header(res, `x-rate-limit-${rule.trim().toLowerCase()}`)
    const stateH = header(res, `x-rate-limit-${rule.trim().toLowerCase()}-state`)
    if (!limitsH || !stateH) continue
    const limits = limitsH.split(',').map((t) => t.split(':').map(Number))
    const states = stateH.split(',').map((t) => t.split(':').map(Number))
    let si = 0
    for (let i = 1; i < limits.length; i++) if (limits[i][0] < limits[si][0]) si = i
    const [limit, period] = limits[si] ?? []
    const currentHits = states[si]?.[0] ?? 0
    if (limit && period) limiter.syncFromState(limit, period, currentHits)
  }
}

/** Take a limiter slot, send the request, re-sync limits, retry once on 429. */
async function apiCall(
  opts: Parameters<typeof request>[0],
  limiter: RateLimiter
): Promise<NetResponse> {
  await limiter.take()
  let res = await request(opts)
  applyRateHeaders(res, limiter)
  if (res.status === 429) {
    // Clamp to a sane band: a hostile/buggy server could send negative or huge values.
    const ra = Math.min(60, Math.max(1, Number(header(res, 'retry-after') ?? '5') || 5))
    await sleep(ra * 1000)
    await limiter.take()
    res = await request(opts)
    applyRateHeaders(res, limiter)
  }
  return res
}

function isHtml(res: NetResponse): boolean {
  const ct = header(res, 'content-type') ?? ''
  if (ct.includes('text/html')) return true
  const head = res.body.trimStart().slice(0, 600)
  return head.startsWith('<') || /just a moment|cloudflare|attention required/i.test(head)
}

function parseJson<T>(body: string): T | null {
  try {
    return JSON.parse(body) as T
  } catch {
    return null
  }
}

const ERR: Record<UiLang, Record<string, string>> = {
  ru: {
    'session-expired': 'POESESSID устарел — обновите его в настройках выше',
    blocked: 'Запрос заблокирован (Cloudflare). Откройте поиск на сайте торговли.',
    'no-league': 'Выберите лигу',
    'rate-limited': 'Слишком много запросов — подождите немного',
    'bad-response': 'Неверный ответ сервера',
    server: 'Сервер торговли недоступен',
    network: 'Ошибка сети'
  },
  en: {
    'session-expired': 'POESESSID expired — update it in the settings above',
    blocked: 'Request blocked (Cloudflare). Open the search on the trade site.',
    'no-league': 'Pick a league',
    'rate-limited': 'Too many requests — wait a moment',
    'bad-response': 'Bad server response',
    server: 'Trade server unavailable',
    network: 'Network error'
  }
}
function errMsg(lang: UiLang, code: string): string {
  return ERR[lang]?.[code] ?? ERR.en[code] ?? code
}

/** Classify a non-2xx / non-JSON response into an error code, or null if it's fine. */
function httpFailureCode(res: NetResponse): string | null {
  if (res.status === 401 || res.status === 403) return isHtml(res) ? 'blocked' : 'session-expired'
  if (res.status === 429) return 'rate-limited'
  if (res.status >= 500) return 'server'
  if (isHtml(res)) return 'blocked'
  if (res.status < 200 || res.status >= 300) return 'bad-response'
  return null
}

function approxNote(item: ParsedItem, lang: UiLang): string | undefined {
  if (item.kind === 'rare' || item.kind === 'magic') {
    return lang === 'ru'
      ? 'Оценка по базе предмета без учёта модов — приблизительно'
      : 'Priced by base type only, mods ignored — approximate'
  }
  const hasNonAscii = (s?: string): boolean =>
    !!s && [...s].some((ch) => ch.charCodeAt(0) > 127)
  if (hasNonAscii(item.name) || hasNonAscii(item.baseType)) {
    return lang === 'ru'
      ? 'Русские названия могут не совпадать с торговым API — возможно неточно'
      : 'Localized names may not match the trade API — may be inaccurate'
  }
  return undefined
}

interface SearchResponse {
  id: string
  result?: string[]
  total?: number
  error?: { code: number; message: string }
}
interface FetchEntry {
  listing?: {
    indexed?: string
    whisper?: string
    price?: { type?: string; amount: number; currency: string }
    account?: { name?: string }
  }
}
interface FetchResponse {
  result?: Array<FetchEntry | null>
}

/** Current PoE2 trade leagues; falls back to a static list when offline. */
export async function getLeagues(): Promise<string[]> {
  try {
    const poesessid = await getSession()
    const res = await request({
      url: `${HOST}/api/trade2/data/leagues`,
      method: 'GET',
      poesessid
    })
    if (res.status !== 200 || isHtml(res)) return FALLBACK_LEAGUES
    const data = parseJson<{ result?: { id?: string }[] }>(res.body)
    const ids = (data?.result ?? []).map((r) => r.id ?? '').filter(Boolean)
    const filtered = filterLeagues(ids)
    return filtered.length ? filtered : FALLBACK_LEAGUES
  } catch {
    return FALLBACK_LEAGUES
  }
}

/** Price-check a copied item: parse it, query trade2, summarize listings. */
export async function priceCheck(itemText: string): Promise<PriceCheckResult> {
  const poesessid = await getSession()
  if (!poesessid) return { status: 'no-session' }
  const item = parseItem(itemText)
  if (!item) return { status: 'not-an-item' }

  const settings = await getSettings()
  const lang = settings.uiLang
  const league = settings.league
  const label = { name: item.name || item.baseType || '?', rarity: item.rarity }
  if (!league) return { status: 'error', message: errMsg(lang, 'no-league') }

  return serialize(async () => {
    try {
      const body = buildSearchBody(item)
      if (DBG) console.log('[trade] search', league, JSON.stringify(body.query))
      const searchRes = await apiCall(
        {
          url: `${HOST}/api/trade2/search/${encodeURIComponent(league)}`,
          method: 'POST',
          poesessid,
          jsonBody: body
        },
        searchLimiter
      )
      const sFail = httpFailureCode(searchRes)
      if (sFail) return { status: 'error', message: errMsg(lang, sFail) }
      const search = parseJson<SearchResponse>(searchRes.body)
      if (!search) return { status: 'error', message: errMsg(lang, 'bad-response') }
      if (search.error) return { status: 'error', message: search.error.message }
      const ids = search.result ?? []
      if (!ids.length) return { status: 'empty', item: label }

      const searchUrl = `${HOST}/trade2/search/poe2/${encodeURIComponent(league)}/${encodeURIComponent(search.id)}`
      const wanted = ids.slice(0, MAX_FETCH)
      const listings: TradeListing[] = []
      for (let i = 0; i < wanted.length; i += FETCH_BATCH) {
        const chunk = wanted.slice(i, i + FETCH_BATCH)
        const fetchRes = await apiCall(
          {
            url: `${HOST}/api/trade2/fetch/${chunk.join(',')}?query=${encodeURIComponent(search.id)}`,
            method: 'GET',
            poesessid
          },
          fetchLimiter
        )
        const fFail = httpFailureCode(fetchRes)
        if (fFail) return { status: 'error', message: errMsg(lang, fFail) }
        const fetched = parseJson<FetchResponse>(fetchRes.body)
        if (!fetched) return { status: 'error', message: errMsg(lang, 'bad-response') }
        for (const entry of fetched.result ?? []) {
          const price = entry?.listing?.price
          if (!price) continue
          listings.push({
            amount: price.amount,
            currency: price.currency,
            account: entry?.listing?.account?.name,
            whisper: entry?.listing?.whisper,
            indexed: entry?.listing?.indexed
          })
        }
      }
      if (!listings.length) return { status: 'empty', item: label }

      const { min, median, display } = summarizeListings(listings)
      const result: PriceResult = {
        query: searchLabel(item),
        league,
        total: search.total ?? listings.length,
        listings: display.slice(0, 10),
        min,
        median,
        note: approxNote(item, lang),
        searchUrl
      }
      return { status: 'ok', item: label, result }
    } catch (e) {
      if (DBG) console.error('[trade] error', e)
      return { status: 'error', message: errMsg(lang, 'network') }
    }
  })
}
