import { create } from 'zustand'
import type { CapturedItem, CurrencyRate, NetError } from '@shared/types'
import { getDefaultPoe1DataStore, type Poe1Data, type Poe1Lang } from '@shared/poe1/data'
import { parseClipboard, type ParseErrorCode, type ParsedItem } from '@shared/poe1/parser'
import {
  buildRequest,
  createPriceCheck,
  localizeTradeRequest,
  setTimelessConquerorMode,
  vilsolUrl,
  type FilterGroup,
  type FilterPreset,
  type StatFilter,
  type TimelessConquerorMode,
  type TradeRequest,
  type TradeStatus
} from '@shared/poe1/pricecheck'
import { fallbackToFilter } from '@shared/poe1/pricecheck/fallback'
import {
  honestPrice,
  type HonestPrice,
  type Poe1ExchangeOffer,
  type Poe1Listing
} from '@shared/poe1/pricecheck/results'
import { chaosRates } from '@shared/poe1/pricecheck/currency'
import { dataValueReader, playerStatsOf, type ModValueReader, type PlayerStat } from '@shared/poe1/pricecheck/compare'
import { noVendor, priceVerdict, withCaution, type Verdict } from '@shared/poe1/pricecheck/verdict'
import {
  checkedMods,
  hasStrongWarning,
  priceWarnings,
  searchContext,
  type PriceWarning,
  type SearchContext
} from '@shared/poe1/pricecheck/warnings'

// Окно цены PoE1 (S4) в оверлее: предмет от Ctrl+D (S1) → данные языка (poeth://data/poe1) → парсер (S2)
// → пресеты фильтров и тело запроса (S4 фаза 1) → поиск через main (шлюз S3, лимиты) → «честная цена».
// Фильтры — мутабельные объекты APT: UI меняет их и увеличивает `rev`, чтобы перерисоваться.
// S15: к результату — вердикт «что делать с предметом» и предупреждения «не тот вариант»; считаются по
// снимку фильтров на момент поиска и пересчитываются, когда приходит курс (честная цена chaos ↔ divine).

export type PcPhase = 'idle' | 'parsing' | 'loading' | 'result' | 'empty' | 'limit' | 'blocked' | 'error'

/** Что было включено в момент поиска — для предупреждений (фильтры потом меняются в UI). */
export interface PcSearched extends SearchContext {
  /** Date.now() поиска — возраст лотов */
  at: number
  /** сколько свойств было отмечено сразу после Ctrl+D */
  defaultOn?: number
}

interface TradeBase {
  total: number
  inexact: boolean
  listings: Poe1Listing[]
  siteUrl: string
  cached: boolean
  searched: PcSearched
  /** S21: тело поиска, которое приняло API, — «Открыть лот» сужает его до продавца */
  query: unknown
}

interface BulkBase {
  total: number
  offers: Poe1ExchangeOffer[]
  siteUrl: string
  cached: boolean
}

export type PcResult =
  | (TradeBase & { kind: 'trade'; honest: HonestPrice; verdict: Verdict; warnings: PriceWarning[] })
  | (BulkBase & { kind: 'bulk'; verdict: Verdict })

export interface PcLeague {
  id: string
  text: string
}

interface PcState {
  phase: PcPhase
  /** текст ошибки разбора или сети */
  parseError?: { code: ParseErrorCode; detail?: string }
  netError?: NetError
  /** когда автоматически повторить после лимита (Date.now()) */
  retryAt?: number
  item: ParsedItem | null
  data: Poe1Data | null
  presets: FilterPreset[]
  activePreset: string
  league: string
  leagues: PcLeague[]
  status: TradeStatus
  /** хост трейда из настроек: ru.pathofexile.com принимает только русские имена предметов */
  siteHost: 'www.pathofexile.com' | 'ru.pathofexile.com'
  simple: boolean
  /** «Написать» у лота сразу отправляет whisper (Settings.priceCheck.sendWhisper) */
  sendWhisper: boolean
  searchStatRange: number
  result?: PcResult
  /** фильтры изменены после последнего поиска */
  dirty: boolean
  /** счётчик правок мутабельных фильтров (для перерисовки) */
  rev: number
  /** курс chaos ↔ divine лиги поиска (фид обмена GGG); null — нет данных, плашка скрыта */
  rate: CurrencyRate | null
  /** сколько свойств отмечено по умолчанию в каждом пресете (для «поиск слишком широкий») */
  defaultsOn: Record<string, number>
  /** S21: свойства предмета игрока для карточки лота «похоже ли на ваш» */
  mine: PlayerStat[]
  /** S21: чтение значений модов лота данными языка сайта (www — en, ru — ru); нет данных — по числам */
  readLotValue?: ModValueReader

  open: (captured: CapturedItem) => Promise<void>
  close: () => void
  search: () => Promise<void>
  /** UI поменял фильтр (галочку, min/max, чип) */
  touch: () => void
  setPreset: (id: string) => void
  setStatus: (status: TradeStatus) => void
  setLeague: (league: string) => void
  setTimelessMode: (mode: TimelessConquerorMode) => void
  /** «Ослабить на 10%»: снизить минимумы (и поднять максимумы) включённых фильтров и искать заново */
  loosen: () => void
}

const dataStore = getDefaultPoe1DataStore()
let session = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
}

export function activePresetOf(s: Pick<PcState, 'presets' | 'activePreset'>): FilterPreset | undefined {
  return s.presets.find((p) => p.id === s.activePreset) ?? s.presets[0]
}

/** Предзагрузка данных обоих языков в простое — первый Ctrl+D не ждёт 9 МБ. */
export function preloadPriceCheckData(): void {
  for (const lang of ['ru', 'en'] as Poe1Lang[]) void dataStore.ensureLanguage(lang).catch(() => undefined)
}

export const usePriceCheckStore = create<PcState>((set, get) => ({
  phase: 'idle',
  item: null,
  data: null,
  presets: [],
  activePreset: '',
  league: '',
  leagues: [],
  status: 'available',
  siteHost: 'www.pathofexile.com',
  simple: true,
  sendWhisper: false,
  searchStatRange: 10,
  dirty: false,
  rev: 0,
  rate: null,
  defaultsOn: {},
  mine: [],

  open: async (captured) => {
    const my = ++session
    clearRetry()
    set({
      phase: 'parsing',
      parseError: undefined,
      netError: undefined,
      result: undefined,
      item: null,
      presets: [],
      dirty: false
    })
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
    const league = get().league && leagues?.leagues.some((l) => l.id === get().league) ? get().league : (leagues?.effective ?? 'Standard')
    const pc = createPriceCheck(item, data, { league, status: get().status, searchStatRange: get().searchStatRange })
    set({
      item,
      data,
      league,
      leagues: leagues?.leagues ?? [{ id: league, text: league }],
      simple: settings?.ui.simpleMode ?? true,
      sendWhisper: settings?.priceCheck?.sendWhisper ?? false,
      siteHost: settings?.siteHost ?? 'www.pathofexile.com',
      presets: pc.presets,
      defaultsOn: Object.fromEntries(pc.presets.map((p) => [p.id, checkedMods(p).on])),
      rate: get().rate?.league === league ? get().rate : null,
      activePreset: pc.active,
      mine: playerStatsOf(item)
    })

    loadRate(league, get, set)
    loadSiteData(my, get().siteHost === 'ru.pathofexile.com' ? 'ru' : 'en', set)

    // моды, которых нет в данных APT (новый патч) → статы сайта; фильтры добавляются выключенными,
    // поэтому на первый поиск не влияют и ждать их не нужно
    if (item.unknownModifiers.length) {
      void api.trade
        .poe1MatchUnknown(
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
    const preset = activePresetOf(get())
    if (!item || !data || !preset) return
    clearRetry()
    preset.filters.trade.league = get().league
    preset.filters.trade.status = get().status
    set({ phase: 'loading', netError: undefined, dirty: false })
    const searched: PcSearched = { ...searchContext(preset), at: Date.now(), defaultOn: get().defaultsOn[preset.id] }

    const req = buildRequest(item, data, preset)
    const api = window.overlayApi.trade
    let res
    let body: unknown = req.body
    if (req.api === 'bulk') {
      res = await api.poe1Exchange({ league: req.league, body: req.body })
    } else {
      // запрос строится на английских именах; ru.pathofexile.com их не принимает («Unknown item name»)
      const hostData = get().siteHost === 'ru.pathofexile.com' ? await dataStore.ensureLanguage('ru').catch(() => null) : null
      if (hostData) body = localizeTradeRequest(req.body as TradeRequest, hostData)
      if (my !== session) return
      res = await api.poe1Search({ league: req.league, body })
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

    const rate = get().rate?.chaosPerDivine
    if ('offers' in res) {
      set({
        phase: res.offers.length ? 'result' : 'empty',
        result: analyzeBulk({ total: res.total, offers: res.offers, siteUrl: res.siteUrl, cached: res.cached }, rate)
      })
    } else {
      const base: TradeBase = {
        total: res.total,
        inexact: res.inexact,
        listings: res.listings,
        siteUrl: res.siteUrl,
        cached: res.cached,
        searched,
        query: body
      }
      set({ phase: res.total > 0 ? 'result' : 'empty', result: analyzeTrade(base, item, rate) })
    }
  },

  touch: () => set((s) => ({ rev: s.rev + 1, dirty: true })),

  setPreset: (id) => {
    set({ activePreset: id, dirty: true })
    void get().search()
  },

  setStatus: (status) => {
    set({ status })
    void get().search()
  },

  setLeague: (league) => {
    set({ league, rate: null })
    loadRate(league, get, set)
    void get().search()
  },

  setTimelessMode: (mode) => {
    const preset = activePresetOf(get())
    const group = preset?.stats.find((s): s is FilterGroup => s.group === 'one' && s.kind === 'timeless')
    if (!preset || !group || !preset.timeless) return
    setTimelessConquerorMode(group, mode)
    preset.timeless = {
      ...preset.timeless,
      mode,
      vilsolUrl: vilsolUrl(preset.timeless.jewel, preset.timeless.seed, mode === 'exact' ? preset.timeless.conqueror : undefined)
    }
    set((s) => ({ rev: s.rev + 1 }))
    void get().search()
  },

  loosen: () => {
    const preset = activePresetOf(get())
    if (!preset) return
    for (const s of preset.stats) {
      const filters: StatFilter[] = s.group ? [] : [s]
      for (const f of filters) {
        if (f.disabled || !f.roll) continue
        const step = Math.max(Math.abs(f.roll.value) * 0.1, f.roll.dp ? 0.01 : 1)
        if (typeof f.roll.min === 'number') f.roll.min = round(f.roll.min - step, f.roll.dp)
        if (typeof f.roll.max === 'number') f.roll.max = round(f.roll.max + step, f.roll.dp)
      }
    }
    set((s) => ({ rev: s.rev + 1 }))
    void get().search()
  }
}))

/** Честная цена, вердикт и предупреждения поиска; курс нужен, чтобы сравнивать chaos и divine. */
function analyzeTrade(base: TradeBase, item: ParsedItem, rate: number | undefined): PcResult {
  const { total, inexact, listings, siteUrl, cached, searched, query } = base
  const honest = honestPrice(listings, total, chaosRates(rate))
  const warnings = priceWarnings({ item, ...searched, listings, honest, inexact, now: searched.at })
  const verdict = priceVerdict({ kind: 'trade', total, listings, honest, chaosPerDivine: rate, noVendor: noVendor(item) })
  return {
    kind: 'trade',
    total,
    inexact,
    listings,
    siteUrl,
    cached,
    searched,
    query,
    honest,
    // выдача про другой вариант (связи, Foulborn, порча) — заметку цены не предлагаем
    verdict: withCaution(verdict, hasStrongWarning(warnings)),
    warnings
  }
}

function analyzeBulk(base: BulkBase, rate: number | undefined): PcResult {
  const best = base.offers[0]
  const each = best && best.itemAmount > 0 ? { amount: best.exchangeAmount / best.itemAmount, currency: best.currency } : undefined
  return { kind: 'bulk', ...base, verdict: priceVerdict({ kind: 'bulk', total: base.total, each, chaosPerDivine: rate }) }
}

/**
 * S21: данные языка сайта трейда — моды лота приходят на нём; значения читаем тем же разбором, что и предмет.
 * Обычно уже в памяти (предзагрузка обоих языков); нет — карточка лота читает числа текста.
 */
function loadSiteData(my: number, lang: Poe1Lang, set: (p: Partial<PcState>) => void): void {
  set({ readLotValue: undefined })
  void dataStore
    .ensureLanguage(lang)
    .then((d) => {
      if (my === session) set({ readLotValue: dataValueReader(d) })
    })
    .catch(() => undefined)
}

/** Курс лиги — фоном (первый раз main может докачивать часы фида); устаревший ответ не применяем. */
function loadRate(league: string, get: () => PcState, set: (p: Partial<PcState>) => void): void {
  void window.overlayApi.trade
    .currencyRate(league)
    .then((rate) => {
      if (get().league !== league) return
      // результат уже пришёл — пересчитать честную цену и вердикт по курсу
      const { result, item } = get()
      const value = rate?.chaosPerDivine
      const next =
        result && item ? (result.kind === 'trade' ? analyzeTrade(result, item, value) : analyzeBulk(result, value)) : result
      set({ rate, result: next })
    })
    .catch(() => undefined)
}

function round(v: number, dp: boolean): number {
  return dp ? Math.round(v * 100) / 100 : Math.round(v)
}
