import { create } from 'zustand'
import type { WealthDiff, WealthOptions, WealthState } from '@shared/types'

// Состояние вкладки «Богатство» (компаньон, S11a). Источник — main (wealth:state + event:wealth.state);
// «что прибавилось» (с прошлого снимка и с начала сессии) перечитывается, когда появляется новый снимок.

interface WealthStore {
  state: WealthState | null
  /** с прошлого снимка */
  diff: WealthDiff | null
  /** с начала сессии фарма */
  sessionDiff: WealthDiff | null
  busy: boolean
  accountError: boolean
  init: () => void
  refresh: () => Promise<void>
  setTabs: (ids: string[]) => Promise<void>
  setAccount: (name: string | null) => Promise<boolean>
  setOptions: (patch: Partial<WealthOptions>) => Promise<void>
  startFarm: () => Promise<void>
  stopFarm: () => Promise<void>
}

let subscribed = false
let lastKey = ''

async function reloadDiffs(set: (p: Partial<WealthStore>) => void, s: WealthState): Promise<void> {
  const session = s.farm.session
  const key = `${s.latest?.id ?? ''}|${session ? `${session.startId}:${session.endId ?? ''}` : ''}`
  if (key === lastKey) return
  lastKey = key
  if (!s.latest) {
    set({ diff: null, sessionDiff: null })
    return
  }
  const api = window.overlayApi.wealth
  const [diff, sessionDiff] = await Promise.all([api.diff(), session ? api.diff('session') : Promise.resolve(null)])
  set({ diff, sessionDiff })
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
    sessionDiff: null,
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
    },
    startFarm: () => run(() => window.overlayApi.wealth.startFarm()),
    stopFarm: () => run(() => window.overlayApi.wealth.stopFarm())
  }
})
