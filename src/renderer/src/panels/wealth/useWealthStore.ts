import { create } from 'zustand'
import type { WealthDiff, WealthOptions, WealthState } from '@shared/types'

// Состояние вкладки «Богатство» (компаньон, S11a). Источник — main (wealth:state + event:wealth.state);
// «что прибавилось с прошлого снимка» перечитывается, когда появляется новый снимок. Сессия фарма —
// у трекера карт S11b (useFarmStore).

interface WealthStore {
  state: WealthState | null
  /** с прошлого снимка */
  diff: WealthDiff | null
  busy: boolean
  accountError: boolean
  init: () => void
  refresh: () => Promise<void>
  setTabs: (ids: string[]) => Promise<void>
  setAccount: (name: string | null) => Promise<boolean>
  setOptions: (patch: Partial<WealthOptions>) => Promise<void>
}

let subscribed = false
let lastKey = ''

async function reloadDiffs(set: (p: Partial<WealthStore>) => void, s: WealthState): Promise<void> {
  const key = s.latest?.id ?? ''
  if (key === lastKey) return
  lastKey = key
  set({ diff: s.latest ? await window.overlayApi.wealth.diff() : null })
}

export const useWealthStore = create<WealthStore>((set) => {
  const apply = (state: WealthState): void => {
    set({ state })
    void reloadDiffs(set, state)
  }
  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    set({ busy: true })
    try {
      await fn()
    } finally {
      set({ busy: false })
    }
  }
  return {
    state: null,
    diff: null,
    busy: false,
    accountError: false,

    init: () => {
      if (subscribed) return
      subscribed = true
      const api = window.overlayApi
      api.onWealthState(apply)
      void api.wealth.state().then(apply)
    },

    refresh: () => run(() => window.overlayApi.wealth.snapshot()),
    setTabs: async (ids) => {
      await window.overlayApi.wealth.setTabs(ids)
    },
    setAccount: async (name) => {
      const r = await window.overlayApi.wealth.setAccount(name)
      set({ accountError: r !== 'ok' })
      return r === 'ok'
    },
    setOptions: async (patch) => {
      apply(await window.overlayApi.wealth.setOptions(patch))
    }
  }
})
