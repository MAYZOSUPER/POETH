import { create } from 'zustand'
import type {
  ItemRegexData,
  MapRegexData,
  PasteSlot,
  RegexEntryInput,
  RegexExportResult,
  RegexImportResult,
  RegexLang,
  RegexLibrary,
  RegexPrefs
} from '@shared/types'
import { defaultRegexPrefs } from '@shared/regex'

// Состояние вкладки Regex (S7): библиотека строк, настройки страниц (запоминаются в
// regex-library.json с задержкой), данные модов карт и предметов (S46) по языкам клиента.

interface RegexState {
  ready: boolean
  library: RegexLibrary | null
  prefs: RegexPrefs
  mapData: Partial<Record<RegexLang, MapRegexData | null>>
  itemData: Partial<Record<RegexLang, ItemRegexData | null>>
  /** когда последний раз скопировали (для «Скопировано ✓») и что */
  copied: { text: string; at: number } | null

  init: () => Promise<void>
  ensureMapData: (lang: RegexLang) => Promise<void>
  ensureItemData: (lang: RegexLang) => Promise<void>
  setPrefs: (patch: Partial<RegexPrefs>) => void
  saveEntry: (input: RegexEntryInput) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  setSlot: (id: string, slot: PasteSlot | null) => Promise<void>
  exportLibrary: () => Promise<RegexExportResult>
  importLibrary: () => Promise<RegexImportResult>
  copy: (text: string) => Promise<void>
}

const api = (): Window['overlayApi']['regex'] => window.overlayApi.regex

const PREFS_DELAY_MS = 400
let pendingPrefs: Partial<RegexPrefs> = {}
let prefsTimer: ReturnType<typeof setTimeout> | null = null
const loadingLangs = new Set<RegexLang>()
const loadingItemLangs = new Set<RegexLang>()

export const useRegexStore = create<RegexState>((set, get) => ({
  ready: false,
  library: null,
  prefs: defaultRegexPrefs(),
  mapData: {},
  itemData: {},
  copied: null,

  init: async () => {
    if (get().ready) return
    const library = await api().library()
    set({ ready: true, library, prefs: library.prefs })
  },

  ensureMapData: async (lang) => {
    if (lang in get().mapData || loadingLangs.has(lang)) return
    loadingLangs.add(lang)
    try {
      const data = await api().mapData(lang)
      set((s) => ({ mapData: { ...s.mapData, [lang]: data } }))
    } finally {
      loadingLangs.delete(lang)
    }
  },

  ensureItemData: async (lang) => {
    if (lang in get().itemData || loadingItemLangs.has(lang)) return
    loadingItemLangs.add(lang)
    try {
      const data = await api().itemData(lang)
      set((s) => ({ itemData: { ...s.itemData, [lang]: data } }))
    } finally {
      loadingItemLangs.delete(lang)
    }
  },

  setPrefs: (patch) => {
    set((s) => ({ prefs: { ...s.prefs, ...patch } }))
    pendingPrefs = { ...pendingPrefs, ...patch }
    if (prefsTimer) clearTimeout(prefsTimer)
    prefsTimer = setTimeout(() => {
      const p = pendingPrefs
      pendingPrefs = {}
      prefsTimer = null
      void api()
        .setPrefs(p)
        .then((library) => set({ library }))
    }, PREFS_DELAY_MS)
  },

  saveEntry: async (input) => {
    set({ library: await api().saveEntry(input) })
  },

  deleteEntry: async (id) => {
    set({ library: await api().deleteEntry(id) })
  },

  setSlot: async (id, slot) => {
    set({ library: await api().setSlot(id, slot) })
  },

  exportLibrary: () => api().exportLibrary(),

  importLibrary: async () => {
    const res = await api().importLibrary()
    if (res.status === 'imported') set({ library: res.library })
    return res
  },

  copy: async (text) => {
    await api().copy(text)
    set({ copied: { text, at: Date.now() } })
  }
}))
