import { create } from 'zustand'
import type { WealthDiff, WealthOptions, WealthSnapshot, WealthState } from '@shared/types'

// Состояние вкладки «Богатство» (компаньон, S11a). Источник — main (wealth:state + event:wealth.state);
// детали последнего снимка и «что прибавилось» перечитываются, когда появляется новый снимок.

interface WealthStore {
  state: WealthState | null
  detail: WealthSnapshot | null
  diff: WealthDiff | null
  busy: boolean
  accountError: boolean
  init: () => void
  snapshot: () => Promise<void>
  refreshTabs: () => Promise<void>
  setTabs: (ids: string[]) => Promise<void>
  setAccount: (name: string | null) => Promise<boolean>
  setOptions: (patch: Partial<WealthOptions>) => Promise<void>
  startFarm: () => Promise<void>
  stopFarm: () => Promise<void>
}

let subscribed = false
let lastDetailId: string | null = null
let lastSessionKey = ''

async function reloadDetails(set: (p: Partial<WealthStore>) => void, s: WealthState): Promise<void> {
  const id = s.latest?.id ?? null
  const sessionKey = s.farm.session ? `${s.farm.session.startId}:${s.farm.session.endId ?? ''}` : ''
  if (id === lastDetailId && sessionKey === lastSessionKey) return
  lastDetailId = id
  lastSessionKey = sessionKey
  if (!id) {
    set({ detail: null, diff: null })
    return
  }
  const api = window.overlayApi.wealth
  const [detail, diff] = await Promise.all([api.detail(), api.diff()])
  set({ detail, diff })
}

export const useWealthStore = create<WealthStore>((set) => {
  const apply = (state: WealthState): void => {
    set({ state })
    void reloadDetails(set, state)
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
    detail: null,
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

    snapshot: () => run(() => window.overlayApi.wealth.snapshot()),
    refreshTabs: () => run(() => window.overlayApi.wealth.refreshTabs()),
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
