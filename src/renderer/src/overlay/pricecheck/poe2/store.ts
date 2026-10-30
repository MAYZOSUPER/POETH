import { create } from 'zustand'
import type { CapturedItem, NetError } from '@shared/types'
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
import { orderBulkOffers, poe2MarketPrice, poe2Verdict } from '@shared/poe2/pricecheck/verdict'
import {
  honestPrice,
  type HonestPrice,
  type MarketPrice,
  type Poe1ExchangeOffer,
  type Poe1Listing
} from '@shared/poe1/pricecheck/results'
import type { Verdict } from '@shared/poe1/pricecheck/verdict'

// Окно цены PoE2 (S47) в оверлее — тот же путь, что у PoE1 (../store.ts): предмет от Ctrl+D → данные языка
// (poeth://data/poe2) → парсер PoE2 (порт EE2) → пресеты фильтров и тело запроса trade2 → поиск через main (тот же
// шлюз S3, лимиты, кэш 5 мин; канал poe2Search) → «честная цена» (общая с PoE1) и вердикт PoE2 (база — exalted).
// Валюта и стакаемое — обмен trade2 (poe2Exchange). Фильтры — мутабельные объекты EE2: UI меняет их и увеличивает
// `rev`. Курса exalted ↔ divine у окна PoE2 пока нет — цены сравниваются в одной валюте (verdict.ts).

export type Pc2Phase = 'idle' | 'parsing' | 'loading' | 'result' | 'empty' | 'limit' | 'blocked' | 'error'

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
      /** цена на рынке: середина самых дешёвых честных лотов в валюте самого дешёвого */
      market?: MarketPrice
      verdict: Verdict
      /** сколько свойств было отмечено в момент поиска */
      checked: number
    }
  | { kind: 'bulk'; total: number; offers: Poe1ExchangeOffer[]; siteUrl: string; cached: boolean; verdict: Verdict }

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

  open: (captured: CapturedItem) => Promise<void>
  close: () => void
  search: () => Promise<void>
  touch: () => void
  setPreset: (id: string) => void
  setListingType: (t: ListingType) => void
  setLeague: (league: string) => void
  /** «Ослабить на 10%»: снизить минимумы (и поднять максимумы) включённых фильтров и искать заново */
  loosen: () => void
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
      activePreset: pc.active
    })

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
    const res =
      req.api === 'bulk'
        ? await api.poe2Exchange({ league: req.league, body: req.body })
        : await api.poe2Search({ league: req.league, body: req.body })
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
      const offers = orderBulkOffers(res.offers)
      const best = offers[0]
      const each = best && best.itemAmount > 0 ? { amount: best.exchangeAmount / best.itemAmount, currency: best.currency } : undefined
      set({
        phase: offers.length ? 'result' : 'empty',
        result: {
          kind: 'bulk',
          total: res.total,
          offers,
          siteUrl: res.siteUrl,
          cached: res.cached,
          verdict: poe2Verdict({ kind: 'bulk', total: res.total, each })
        }
      })
      return
    }
    const honest = honestPrice(res.listings, res.total)
    set({
      phase: res.total > 0 ? 'result' : 'empty',
      result: {
        kind: 'trade',
        total: res.total,
        inexact: res.inexact,
        listings: res.listings,
        siteUrl: res.siteUrl,
        cached: res.cached,
        query: req.body,
        honest,
        market: poe2MarketPrice(res.listings, honest),
        verdict: poe2Verdict({ kind: 'trade', total: res.total, listings: res.listings, honest, noVendor: noVendor(item) }),
        checked: checkedCount(preset)
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
    set({ league })
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
  }
}))
