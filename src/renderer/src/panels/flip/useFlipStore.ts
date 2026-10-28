import { create } from 'zustand'
import type { FlipFilters, FlipState } from '@shared/types'

// Состояние вкладки «Обмен» (компаньон, S13). Источник — main (flip:state + event:flip.state).

interface FlipStore {
  state: FlipState | null
  busy: boolean
  init: () => void
  refresh: () => Promise<void>
  setFilters: (patch: Partial<FlipFilters>) => Promise<void>
}

let subscribed = false

export const useFlipStore = create<FlipStore>((set) => ({
  state: null,
  busy: false,
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
  }
}))
