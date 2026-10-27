import { create } from 'zustand'
import type { CapturedItem, NetError } from '@shared/types'
import { getDefaultPoe1DataStore, type Poe1Data, type Poe1Lang } from '@shared/poe1/data'
import { parseClipboard, type ParseErrorCode, type ParsedItem } from '@shared/poe1/parser'
import {
  buildRequest,
  createPriceCheck,
  setTimelessConquerorMode,
  vilsolUrl,
  type FilterGroup,
  type FilterPreset,
  type StatFilter,
  type TimelessConquerorMode,
  type TradeStatus
} from '@shared/poe1/pricecheck'
import { fallbackToFilter } from '@shared/poe1/pricecheck/fallback'
import {
  honestPrice,
  type HonestPrice,
  type Poe1ExchangeOffer,
  type Poe1Listing
} from '@shared/poe1/pricecheck/results'

// Окно цены PoE1 (S4) в оверлее: предмет от Ctrl+D (S1) → данные языка (poeth://data/poe1) → парсер (S2)
// → пресеты фильтров и тело запроса (S4 фаза 1) → поиск через main (шлюз S3, лимиты) → «честная цена».
// Фильтры — мутабельные объекты APT: UI меняет их и увеличивает `rev`, чтобы перерисоваться.

export type PcPhase = 'idle' | 'parsing' | 'loading' | 'result' | 'empty' | 'limit' | 'blocked' | 'error'

export type PcResult =
  | {
      kind: 'trade'
      total: number
      inexact: boolean
      listings: Poe1Listing[]
      honest: HonestPrice
      siteUrl: string
      cached: boolean
    }
  | { kind: 'bulk'; total: number; offers: Poe1ExchangeOffer[]; siteUrl: string; cached: boolean }

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
  simple: boolean
  searchStatRange: number
  result?: PcResult
  /** фильтры изменены после последнего поиска */
  dirty: boolean
  /** счётчик правок мутабельных фильтров (для перерисовки) */
  rev: number

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
  simple: true,
  searchStatRange: 10,
  dirty: false,
  rev: 0,

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
      presets: pc.presets,
      activePreset: pc.active
    })

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

    const req = buildRequest(item, data, preset)
    const api = window.overlayApi.trade
    const res =
      req.api === 'bulk'
        ? await api.poe1Exchange({ league: req.league, body: req.body })
        : await api.poe1Search({ league: req.league, body: req.body })
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
      set({
        phase: res.offers.length ? 'result' : 'empty',
        result: { kind: 'bulk', total: res.total, offers: res.offers, siteUrl: res.siteUrl, cached: res.cached }
      })
    } else {
      set({
        phase: res.total > 0 ? 'result' : 'empty',
        result: {
          kind: 'trade',
          total: res.total,
          inexact: res.inexact,
          listings: res.listings,
          honest: honestPrice(res.listings, res.total),
          siteUrl: res.siteUrl,
          cached: res.cached
        }
      })
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
    set({ league })
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

function round(v: number, dp: boolean): number {
  return dp ? Math.round(v * 100) / 100 : Math.round(v)
}
