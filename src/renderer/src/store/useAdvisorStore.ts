import { create } from 'zustand'
import type { AdvisorFarmResult, AdvisorState } from '@shared/types'
import { DEFAULT_ADVISOR_VIEW, type AdvisorView } from '../panels/advisor/view'

// Состояние вкладки «Что фармить» (компаньон, S16). Источник — main (advisor:state + event:advisor.state);
// сортировка, раскрытая карточка и ответ кнопки сессии — только вид, живут до перезапуска.

interface AdvisorStore {
  state: AdvisorState | null
  busy: boolean
  view: AdvisorView
  /** раскрытая карточка */
  open: string | null
  /** ответ на «Начать сессию фарма» по стратегии (подпись под кнопкой) */
  farm: Record<string, AdvisorFarmResult>
  init: () => void
  refresh: () => Promise<void>
  startFarm: (id: string) => Promise<void>
  setView: (patch: Partial<AdvisorView>) => void
  toggle: (id: string) => void
}

let subscribed = false

export const useAdvisorStore = create<AdvisorStore>((set, get) => ({
  state: null,
  busy: false,
  view: DEFAULT_ADVISOR_VIEW,
  open: null,
  farm: {},
  init: () => {
    if (subscribed) return
    subscribed = true
    const api = window.overlayApi
    api.onAdvisorState((state) => set({ state }))
    void api.advisor.state().then((state) => set({ state }))
  },
  refresh: async () => {
    if (get().busy) return
    set({ busy: true })
    try {
      set({ state: await window.overlayApi.advisor.refresh() })
    } finally {
      set({ busy: false })
    }
  },
  startFarm: async (id) => {
    const res = await window.overlayApi.advisor.startFarm(id)
    set((s) => ({ farm: { ...s.farm, [id]: res } }))
  },
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  toggle: (id) => set((s) => ({ open: s.open === id ? null : id }))
}))
