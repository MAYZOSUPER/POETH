import { create } from 'zustand'
import type {
  BlacklistHit,
  BlacklistStatus,
  Deal,
  DealLang,
  DealStatus,
  DealsConfigPatch,
  DealsExportResult,
  DealsFilter,
  DealsLogStatus,
  DealsState
} from '@shared/types'

// Состояние вкладки «Сделки» (S8): история и настройки менеджера из main, страница/фильтр/поиск.
// Подписки на события main ставятся один раз в init().

export type DealsPage = 'history' | 'replies' | 'stash' | 'blacklist'

interface DealsUi {
  ready: boolean
  state: DealsState | null
  blacklist: BlacklistStatus | null
  log: DealsLogStatus | null
  page: DealsPage
  filter: DealsFilter
  query: string
  /** последняя новая сделка (для звука) */
  lastNew: Deal | null

  init: () => Promise<void>
  setPage: (p: DealsPage) => void
  setFilter: (f: DealsFilter) => void
  setQuery: (q: string) => void
  setStatus: (id: string, status: DealStatus) => Promise<void>
  remove: (id: string) => Promise<void>
  clear: (demoOnly?: boolean) => Promise<void>
  setConfig: (patch: DealsConfigPatch) => Promise<void>
  exportHistory: () => Promise<DealsExportResult>
  demo: (lang: DealLang) => Promise<void>
  simulate: (lines: string[]) => Promise<Deal[]>
  refreshBlacklist: () => Promise<void>
  checkPlayer: (name: string) => Promise<BlacklistHit | null>
}

const api = () => window.overlayApi.deals

let subscribed = false

export const useDealsStore = create<DealsUi>((set, get) => ({
  ready: false,
  state: null,
  blacklist: null,
  log: null,
  page: 'history',
  filter: 'all',
  query: '',
  lastNew: null,

  async init() {
    if (!subscribed) {
      subscribed = true
      window.overlayApi.onDealsChanged((state) => set({ state }))
      window.overlayApi.onDealsNew((deal) => set({ lastNew: deal }))
      window.overlayApi.onDealsBlacklist((blacklist) => set({ blacklist }))
    }
    if (get().ready) return
    const [state, blacklist, log] = await Promise.all([api().state(), api().blacklist.status(), api().logStatus()])
    set({ state, blacklist, log, ready: true })
  },
  setPage: (page) => set({ page }),
  setFilter: (filter) => set({ filter }),
  setQuery: (query) => set({ query }),
  async setStatus(id, status) {
    set({ state: await api().setStatus(id, status) })
  },
  async remove(id) {
    set({ state: await api().remove(id) })
  },
  async clear(demoOnly) {
    set({ state: await api().clear(demoOnly) })
  },
  async setConfig(patch) {
    set({ state: await api().setConfig(patch) })
  },
  exportHistory: () => api().export(),
  async demo(lang) {
    set({ state: await api().demo(lang), filter: 'all', query: '' })
  },
  simulate: (lines) => api().simulate(lines),
  async refreshBlacklist() {
    set({ blacklist: await api().blacklist.refresh() })
  },
  checkPlayer: (name) => api().blacklist.check(name)
}))
