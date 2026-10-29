import { create } from 'zustand'
import type { FlipFilters, FlipOptions, FlipState } from '@shared/types'
import { DEFAULT_VIEW, type FlipView, type RateRange } from './view'

// Состояние вкладки «Обмен» (компаньон, S13). Источник — main (flip:state + event:flip.state); фильтры простого
// режима, сортировка, выбранная строка, окно графика и курсы, введённые из игры, — только вид, живут до перезапуска.

interface FlipStore {
  state: FlipState | null
  busy: boolean
  view: FlipView
  selected: string | null
  range: RateRange
  /** «Цена в игре сейчас» как введена: ключ — gameKey (нога + предмет + база) */
  game: Record<string, string>
  setGame: (key: string, text: string) => void
  init: () => void
  refresh: () => Promise<void>
  setFilters: (patch: Partial<FlipFilters>) => Promise<void>
  setOptions: (patch: Partial<FlipOptions>) => Promise<void>
  setView: (patch: Partial<FlipView>) => void
  pick: (id: string) => void
  setRange: (range: RateRange) => void
}

let subscribed = false

export const useFlipStore = create<FlipStore>((set) => ({
  state: null,
  busy: false,
  view: DEFAULT_VIEW,
  selected: null,
  range: '24h',
  game: {},
  setGame: (key, text) =>
    set((s) => {
      const game = { ...s.game }
      if (text.trim()) game[key] = text
      else delete game[key]
      return { game }
    }),
  init: () => {
    if (subscribed) return
    subscribed = true
    const api = window.overlayApi
    api.onFlipState((state) => set({ state }))
    void api.flip.state().then((state) => set({ state }))
  },
  refresh: async () => {
    set({ busy: true })
    try {
      set({ state: await window.overlayApi.flip.refresh() })
    } finally {
      set({ busy: false })
    }
  },
  setFilters: async (patch) => {
    set({ state: await window.overlayApi.flip.setFilters(patch) })
  },
  setOptions: async (patch) => {
    set({ state: await window.overlayApi.flip.setOptions(patch) })
  },
  setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),
  pick: (selected) => set({ selected }),
  setRange: (range) => set({ range })
}))
