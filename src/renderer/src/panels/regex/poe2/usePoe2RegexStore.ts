import { create } from 'zustand'
import type {
  Poe2PriceResult,
  Poe2ProfileInput,
  Poe2RegexData,
  Poe2RegexPrefs,
  Poe2RegexState,
  RegexLang
} from '@shared/types'
import { defaultPoe2Prefs } from '@shared/regex/poe2'

// Состояние вкладки Regex в режиме PoE 2 (S62): данные по языкам клиента, настройки страниц (запоминаются в
// regex-poe2.json с задержкой), профили «что нужно» и последняя «Цена по профилю» (по клику, без опросов).
// Строки библиотеки — общий стор useRegexStore (game 'poe2').

interface Poe2RegexStore {
  ready: boolean
  prefs: Poe2RegexPrefs
  profiles: Poe2RegexState['profiles']
  data: Partial<Record<RegexLang, Poe2RegexData | null>>
  /** id профиля → результат последней проверки цены (только в памяти) */
  prices: Record<string, { pending: boolean; result?: Poe2PriceResult; at?: number }>

  init: () => Promise<void>
  ensureData: (lang: RegexLang) => Promise<void>
  setPrefs: (patch: Partial<Poe2RegexPrefs>) => void
  saveProfile: (input: Poe2ProfileInput) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  /** Одно нажатие — один поиск trade2 (повторный клик, пока идёт запрос, игнорируется). */
  price: (profileId: string, body: unknown) => Promise<void>
}

const api = (): Window['overlayApi']['regex'] => window.overlayApi.regex

const PREFS_DELAY_MS = 400
let pending: Partial<Poe2RegexPrefs> = {}
let timer: ReturnType<typeof setTimeout> | null = null
const loading = new Set<RegexLang>()

export const usePoe2RegexStore = create<Poe2RegexStore>((set, get) => ({
  ready: false,
  prefs: defaultPoe2Prefs(),
  profiles: [],
  data: {},
  prices: {},

  init: async () => {
    if (get().ready) return
    const s = await api().poe2State()
    set({ ready: true, prefs: s.prefs, profiles: s.profiles })
  },

  ensureData: async (lang) => {
    if (lang in get().data || loading.has(lang)) return
    loading.add(lang)
    try {
      const d = await api().poe2Data(lang)
      set((s) => ({ data: { ...s.data, [lang]: d } }))
    } finally {
      loading.delete(lang)
    }
  },

  setPrefs: (patch) => {
    set((s) => ({ prefs: { ...s.prefs, ...patch } }))
    pending = { ...pending, ...patch }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const p = pending
      pending = {}
      timer = null
      void api().poe2SetPrefs(p)
    }, PREFS_DELAY_MS)
  },

  saveProfile: async (input) => {
    const s = await api().poe2SaveProfile(input)
    set({ profiles: s.profiles })
  },

  deleteProfile: async (id) => {
    const s = await api().poe2DeleteProfile(id)
    set((st) => {
      const prices = { ...st.prices }
      delete prices[id]
      return { profiles: s.profiles, prices }
    })
  },

  price: async (profileId, body) => {
    if (get().prices[profileId]?.pending) return
    set((s) => ({
      prices: {
        ...s.prices,
        [profileId]: { ...s.prices[profileId], pending: true }
      }
    }))
    let result: Poe2PriceResult
    try {
      result = await api().poe2Price(body)
    } catch {
      result = { ok: false, error: { code: 'network' } }
    }
    set((s) => ({
      prices: {
        ...s.prices,
        [profileId]: { pending: false, result, at: Date.now() }
      }
    }))
  }
}))
