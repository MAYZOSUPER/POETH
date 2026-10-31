import { create } from 'zustand'
import type { AngePrice, CapturedItem, NetError, Poe2CurrencyRate } from '@shared/types'
import { getDefaultPoe2DataStore, type Poe2Data, type Poe2Lang } from '@shared/poe2/data'
import { parseClipboard, ItemCategory, type ParseErrorCode, type ParsedItem } from '@shared/poe2/parser'
import {
  buildRequest,
  createPriceCheck,
  fallbackToFilter,
  type FilterPreset,
  type ListingType,
  type StatFilter
} from '@shared/poe2/pricecheck'
import { orderBulkOffers, poe2MarketPrice, poe2Verdict, type MarketPrice2, type Verdict2 } from '@shared/poe2/pricecheck/verdict'
import { angeConfidence } from '@shared/poe2/pricecheck/ange'
import { exaltedRates, type ExaltedRates } from '@shared/poe2/pricecheck/currency'
import { angeUnit } from '@shared/poe2/pricecheck/priceBlock'
import { buildQueryUrl } from '@shared/favorites/tradeUrl'
import { honestPrice, type HonestPrice, type Poe1ExchangeOffer, type Poe1Listing } from '@shared/poe1/pricecheck/results'
import type { PcSiteOffers } from '../store'

// Окно цены PoE2 (S47) в оверлее — тот же путь, что у PoE1 (../store.ts): предмет от Ctrl+D → данные языка
// (poeth://data/poe2) → парсер PoE2 (порт EE2) → пресеты фильтров и тело запроса trade2 → поиск через main (тот же
// шлюз S3, лимиты, кэш 5 мин; канал poe2Search) → «честная цена» (общая с PoE1) и вердикт PoE2 (база — exalted).
// Валюта и стакаемое — обмен trade2 (poe2Exchange). Фильтры — мутабельные объекты EE2: UI меняет их и увеличивает
// `rev`.
// S61: курс exalted ↔ divine ↔ chaos лиги — по фиду обмена GGG (trade.poe2Rate, фоном при открытии); цены лотов в
// разных валютах сравниваются в exalted, прочие валюты лотов (regal, annul…) — по цене у Ange (trade.poe2Ange). Всё,
// что меняют у Ange, — цена по фиду без запроса к сайту (как S24 «у Фаустуса»); объявления сайта — по кнопке.

export type Pc2Phase = 'idle' | 'parsing' | 'loading' | 'result' | 'empty' | 'limit' | 'blocked' | 'error'

export type Pc2SiteOffers = PcSiteOffers

export type Pc2Result =
  | {
      kind: 'trade'
      total: number
      inexact: boolean
      listings: Poe1Listing[]
      siteUrl: string
      cached: boolean
      /** тело поиска, которое приняло API (для «В избранное» и отладки) */
      query: unknown
      honest: HonestPrice
      /** цена на рынке: середина самых дешёвых честных лотов (в exalted по курсу или в валюте самого дешёвого) */
      market?: MarketPrice2
      verdict: Verdict2
      /** сколько свойств было отмечено в момент поиска */
      checked: number
    }
  | { kind: 'bulk'; total: number; offers: Poe1ExchangeOffer[]; siteUrl: string; cached: boolean; verdict: Verdict2 }
  | {
      /** S61: цена у Ange по фиду обмена GGG — без запроса к сайту */
      kind: 'ange'
      ange: AngePrice
      /** штук в стопке у предмета игрока (1 — не стопка) */
      stack: number
      league: string
      /** тело обмена trade2 — для «Объявления на сайте» */
      body: unknown
      /** до загрузки объявлений — страница обмена с этим запросом (?q=), после — поиск сайта */
      siteUrl: string
      site: Pc2SiteOffers
      verdict: Verdict2
    }

export interface Pc2League {
  id: string
  text: string
}

interface Pc2State {
  phase: Pc2Phase
  parseError?: { code: ParseErrorCode; detail?: string }
  netError?: NetError
  retryAt?: number
  item: ParsedItem | null
  data: Poe2Data | null
  presets: FilterPreset[]
  activePreset: string
  league: string
  leagues: Pc2League[]
  listingType: ListingType
  simple: boolean
  sendWhisper: boolean
  searchStatRange: number
  result?: Pc2Result
  dirty: boolean
  rev: number
  /** S61: курс exalted ↔ divine ↔ chaos лиги (фид обмена GGG); null — данных нет, цены в одной валюте */
  rate: Poe2CurrencyRate | null
  /** S61: exalted за 1 шт. прочих валют лотов (regal, annul…) по цене у Ange, лиги `league` */
  more: ExaltedRates

  open: (captured: CapturedItem) => Promise<void>
  close: () => void
  search: () => Promise<void>
  touch: () => void
  setPreset: (id: string) => void
  setListingType: (t: ListingType) => void
  setLeague: (league: string) => void
  /** «Ослабить на 10%»: снизить минимумы (и поднять максимумы) включённых фильтров и искать заново */
  loosen: () => void
  /** S61: «Объявления на сайте» у цены Ange — один запрос обмена */
  loadSiteOffers: () => Promise<void>
}

const dataStore = getDefaultPoe2DataStore()
let session = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
}

export function activePreset2Of(s: Pick<Pc2State, 'presets' | 'activePreset'>): FilterPreset | undefined {
  return s.presets.find((p) => p.id === s.activePreset) ?? s.presets[0]
}

/** Предзагрузка данных обоих языков в простое — первый Ctrl+D не ждёт ~6 МБ. */
export function preloadPoe2Data(): void {
  for (const lang of ['ru', 'en'] as Poe2Lang[]) void dataStore.ensureLanguage(lang).catch(() => undefined)
}

/** Валюта, стопки: «продайте торговцу» не говорим. */
function noVendor(item: ParsedItem): boolean {
  return item.stackSize != null || item.category === ItemCategory.Currency
}

function checkedCount(preset: FilterPreset): number {
  return preset.stats.filter((s) => !s.disabled).length
}

function round(v: number, dp: boolean): number {
  return dp ? Math.round(v * 100) / 100 : Math.round(v)
}

/** Курсы лиги для сравнения цен: exalted, divine, chaos по курсу + прочие валюты по Ange. */
export function ratesOf(s: Pick<Pc2State, 'rate' | 'more'>): ExaltedRates | undefined {
  return exaltedRates(s.rate, s.more)
}

export const usePoe2PriceCheckStore = create<Pc2State>((set, get) => ({
  phase: 'idle',
  item: null,
  data: null,
  presets: [],
  activePreset: '',
  league: '',
  leagues: [],
  listingType: 'available',
  simple: true,
  sendWhisper: false,
  searchStatRange: 10,
  dirty: false,
  rev: 0,
  rate: null,
  more: {},

  open: async (captured) => {
    const my = ++session
    clearRetry()
    set({ phase: 'parsing', parseError: undefined, netError: undefined, result: undefined, item: null, presets: [], dirty: false })
    const api = window.overlayApi
    const [data, settings, leagues] = await Promise.all([
      dataStore.ensureLanguage(captured.lang).catch(() => null),
      api.settings.get().catch(() => null),
      api.leagues.get().catch(() => null)
    ])
    if (my !== session) return
    if (!data) {
      set({ phase: 'error', parseError: { code: 'item.parse_error', detail: 'data' } })
      return
    }
    const parsed = parseClipboard(captured.text, data)
    if (!parsed.ok) {
      set({ phase: 'error', data, parseError: { code: parsed.error, detail: parsed.detail } })
      return
    }
    const item = parsed.value
    const known = get().league && leagues?.leagues.some((l) => l.id === get().league)
    const league = known ? get().league : (leagues?.effective ?? 'Standard')
    const pc = createPriceCheck(item, data, { league, listingType: get().listingType, searchStatRange: get().searchStatRange })
    set({
      item,
      data,
      league,
      leagues: leagues?.leagues ?? [{ id: league, text: league }],
      simple: settings?.ui.simpleMode ?? true,
      sendWhisper: settings?.priceCheck?.sendWhisper ?? false,
      presets: pc.presets,
      activePreset: pc.active,
      ...(ratesLeague === league ? {} : { rate: null, more: resetRates(league) })
    })
    // курс лиги — фоном (первый раз main качает свежие часы фида PoE 2)
    if (get().rate?.league !== league) loadRate(league, get, set)

    // моды, которых нет в данных EE2 (новый патч) → статы trade2; фильтры добавляются выключенными
    if (item.unknownModifiers.length) {
      void api.trade
        .poe2MatchUnknown(
          item.lang,
          item.unknownModifiers.map((m) => ({ text: m.text, type: m.type }))
        )
        .then((matches) => {
          if (my !== session || !matches.length) return
          for (const preset of get().presets) {
            for (const m of matches) preset.stats.push(fallbackToFilter(m, item, get().searchStatRange))
          }
          set((s) => ({ rev: s.rev + 1 }))
        })
        .catch(() => undefined)
    }

    await get().search()
  },

  close: () => {
    session++
    clearRetry()
    set({ phase: 'idle', item: null, presets: [], result: undefined, netError: undefined, parseError: undefined })
  },

  search: async () => {
    const my = session
    const { item, data } = get()
    const preset = activePreset2Of(get())
    if (!item || !data || !preset) return
    clearRetry()
    preset.filters.trade.league = get().league
    preset.filters.trade.listingType = get().listingType
    set({ phase: 'loading', netError: undefined, dirty: false })

    const req = buildRequest(item, data, preset)
    const api = window.overlayApi.trade
    let res
    if (req.api === 'bulk') {
      // S61: что меняют у Ange — цена по фиду обмена, к сайту не идём (объявления — по кнопке)
      const ange = await angeOf(req.league, item.info.refName)
      if (my !== session) return
      if (ange) {
        const prev = get().result
        const reloadSite = prev?.kind === 'ange' && prev.site.phase !== 'idle'
        set({
          phase: 'result',
          result: {
            kind: 'ange',
            ange,
            stack: item.stackSize?.value ?? 1,
            league: req.league,
            body: req.body,
            siteUrl: exchangeQueryUrl(req.league, req.body),
            site: { phase: 'idle' },
            verdict: angeVerdict(ange)
          }
        })
        if (reloadSite) void get().loadSiteOffers()
        return
      }
      res = await api.poe2Exchange({ league: req.league, body: req.body })
    } else {
      res = await api.poe2Search({ league: req.league, body: req.body })
    }
    if (my !== session) return

    if (!res.ok) {
      const err = res.error
      if (err.code === 'rate-limited') {
        const wait = Math.max(1000, err.retryAfterMs ?? 10_000)
        set({ phase: 'limit', netError: err, retryAt: Date.now() + wait })
        retryTimer = setTimeout(() => {
          if (my === session) void get().search()
        }, wait)
      } else if (err.code === 'blocked') {
        set({ phase: 'blocked', netError: err })
      } else {
        set({ phase: 'error', netError: err })
      }
      return
    }

    if ('offers' in res) {
      set({ phase: res.offers.length ? 'result' : 'empty', result: analyzeBulk(res, ratesOf(get())) })
      return
    }
    const base: TradeBase = {
      total: res.total,
      inexact: res.inexact,
      listings: res.listings,
      siteUrl: res.siteUrl,
      cached: res.cached,
      query: req.body,
      checked: checkedCount(preset)
    }
    // валюты лотов кроме exalted/divine/chaos (regal, annul…) — в exalted по Ange; долго — без них, потом пересчёт
    const tags = [...new Set(res.listings.map((l) => l.price?.currency).filter((c): c is string => !!c))]
    const ready = ensureRates(req.league, data, tags, get, set)
    await Promise.race([ready, new Promise((r) => setTimeout(r, RATES_WAIT_MS))])
    if (my !== session) return
    set({ phase: res.total > 0 ? 'result' : 'empty', result: analyzeTrade(base, item, ratesOf(get())) })
    void ready.then((added) => {
      const { result: r, item: it } = get()
      if (added && my === session && r?.kind === 'trade' && r.listings === base.listings && it) {
        set({ result: analyzeTrade(r, it, ratesOf(get())) })
      }
    })
  },

  touch: () => set((s) => ({ rev: s.rev + 1, dirty: true })),

  setPreset: (id) => {
    set({ activePreset: id, dirty: true })
    void get().search()
  },

  setListingType: (listingType) => {
    set({ listingType })
    void get().search()
  },

  setLeague: (league) => {
    set({ league, rate: null, more: resetRates(league) })
    loadRate(league, get, set)
    void get().search()
  },

  loosen: () => {
    const preset = activePreset2Of(get())
    if (!preset) return
    for (const f of preset.stats as StatFilter[]) {
      if (f.disabled || !f.roll) continue
      const step = Math.max(Math.abs(f.roll.value) * 0.1, f.roll.dp ? 0.01 : 1)
      if (typeof f.roll.min === 'number') f.roll.min = round(f.roll.min - step, f.roll.dp)
      if (typeof f.roll.max === 'number') f.roll.max = round(f.roll.max + step, f.roll.dp)
    }
    set((s) => ({ rev: s.rev + 1 }))
    void get().search()
  },

  loadSiteOffers: async () => {
    const my = session
    const r = get().result
    if (r?.kind !== 'ange' || r.site.phase === 'loading') return
    const patch = (site: Pc2SiteOffers, siteUrl?: string): void => {
      const cur = get().result
      if (my !== session || cur?.kind !== 'ange' || cur.body !== r.body) return
      set({ result: { ...cur, site, siteUrl: siteUrl ?? cur.siteUrl } })
    }
    patch({ phase: 'loading' })
    const res = await window.overlayApi.trade.poe2Exchange({ league: r.league, body: r.body }).catch(() => null)
    if (!res) return patch({ phase: 'error' })
    if (res.ok) {
      const offers = orderBulkOffers(res.offers, ratesOf(get()))
      return patch({ phase: 'ok', total: res.total, offers, cached: res.cached }, res.siteUrl)
    }
    if (res.error.code === 'rate-limited') {
      return patch({ phase: 'limit', retryAt: Date.now() + Math.max(1000, res.error.retryAfterMs ?? 10_000) })
    }
    patch({ phase: 'error', error: res.error })
  }
}))

// ---------------------------------------------------------------- S61: курс и цена у Ange

interface TradeBase {
  total: number
  inexact: boolean
  listings: Poe1Listing[]
  siteUrl: string
  cached: boolean
  query: unknown
  checked: number
}

/** Ждём курсы валют лотов не дольше — потом показываем без них и пересчитываем, когда придут. */
const RATES_WAIT_MS = 1500
/** валюты с курсом из фида (не спрашиваем у Ange) */
const RATE_TAGS = new Set(['exalted', 'divine', 'chaos'])

let ratesLeague = ''
/** теги, о которых уже спрашивали в лиге `ratesLeague` (нет у Ange — тоже не спрашиваем снова) */
let ratesAsked = new Set<string>()

function resetRates(league: string): ExaltedRates {
  ratesLeague = league
  ratesAsked = new Set()
  return {}
}

/** Цена предмета у Ange; нет в фиде, нет сети или курса — null (тогда обмен на сайте, как раньше). */
async function angeOf(league: string, refName: string): Promise<AngePrice | null> {
  const res = await window.overlayApi.trade.poe2Ange({ league, names: [refName] }).catch(() => null)
  return res?.ok ? (res.prices[refName] ?? null) : null
}

/** Страница обмена trade2 с этим запросом (…/trade2/exchange/poe2/<лига>?q={"exchange":…}). */
function exchangeQueryUrl(league: string, body: unknown): string {
  const query = (body as { query?: unknown } | null)?.query
  return buildQueryUrl('www.pathofexile.com', 'poe2', 'exchange', league, JSON.stringify({ exchange: query }))
}

export function angeVerdict(a: AngePrice): Verdict2 {
  return poe2Verdict({
    kind: 'exchange',
    exalted: a.exalted,
    confidence: angeConfidence(a),
    volume: a.main.volume + a.others.reduce((s, m) => s + m.volume, 0),
    exaltedPerDivine: a.exaltedPerDivine,
    // плашка — в той же единице, что главная строка «у Ange» (Divine Orb — в exalted)
    unit: angeUnit(a)
  })
}

/**
 * Курсы валют лотов (кроме exalted/divine/chaos) по цене у Ange: один локальный запрос к main на новые теги.
 * true — добавились курсы (стоит пересчитать цену).
 */
async function ensureRates(
  league: string,
  data: Poe2Data,
  tags: readonly string[],
  get: () => Pc2State,
  set: (p: Partial<Pc2State>) => void
): Promise<boolean> {
  if (ratesLeague !== league) set({ more: resetRates(league) })
  const names = new Map<string, string>()
  // английское имя валюты по trade tag (refName у обоих языков английский)
  const refs = data.tradeTagToRef()
  for (const tag of tags) {
    if (RATE_TAGS.has(tag) || ratesAsked.has(tag)) continue
    ratesAsked.add(tag)
    const name = refs.get(tag)
    if (name) names.set(name, tag)
  }
  if (!names.size) return false
  const asked = ratesAsked
  const res = await window.overlayApi.trade.poe2Ange({ league, names: [...names.keys()] }).catch(() => null)
  if (!res?.ok) {
    // нет сети или курса — спросим снова при следующем поиске
    for (const tag of names.values()) asked.delete(tag)
    return false
  }
  if (ratesLeague !== league) return false
  const next: Record<string, number> = { ...get().more }
  let added = false
  for (const [name, tag] of names) {
    const p = res.prices[name]
    if (p && p.exalted > 0) {
      next[tag] = p.exalted
      added = true
    }
  }
  // курс пришёл вместе с ценами — не ждать отдельного ответа
  if (!get().rate) set({ rate: { league, ...res.rate } })
  if (added) set({ more: next })
  return added
}

function analyzeTrade(base: TradeBase, item: ParsedItem, rates: ExaltedRates | undefined): Pc2Result {
  const { total, listings } = base
  const honest = honestPrice(listings, total, rates)
  return {
    kind: 'trade',
    ...base,
    honest,
    market: poe2MarketPrice(listings, honest, rates),
    verdict: poe2Verdict({ kind: 'trade', total, listings, honest, noVendor: noVendor(item), rates })
  }
}

function analyzeBulk(
  res: { total: number; offers: Poe1ExchangeOffer[]; siteUrl: string; cached: boolean },
  rates: ExaltedRates | undefined
): Pc2Result {
  const offers = orderBulkOffers(res.offers, rates)
  const best = offers[0]
  const each = best && best.itemAmount > 0 ? { amount: best.exchangeAmount / best.itemAmount, currency: best.currency } : undefined
  return {
    kind: 'bulk',
    total: res.total,
    offers,
    siteUrl: res.siteUrl,
    cached: res.cached,
    verdict: poe2Verdict({ kind: 'bulk', total: res.total, each, rates })
  }
}

/** Курс лиги — фоном; пришёл — пересчитать честную цену и вердикт; устаревший ответ не применяем. */
function loadRate(league: string, get: () => Pc2State, set: (p: Partial<Pc2State>) => void): void {
  void window.overlayApi.trade
    .poe2Rate(league)
    .then((rate) => {
      if (get().league !== league || !rate) return
      const { result, item } = get()
      set({ rate })
      const rates = ratesOf(get())
      if (!result || !item) return
      if (result.kind === 'trade') set({ result: analyzeTrade(result, item, rates) })
      else if (result.kind === 'bulk') set({ result: analyzeBulk(result, rates) })
    })
    .catch(() => undefined)
}
