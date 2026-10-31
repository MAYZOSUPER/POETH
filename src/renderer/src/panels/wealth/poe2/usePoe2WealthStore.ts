import { create } from 'zustand'
import type { Poe2ScreenEdit, Poe2WealthState, WealthDiff } from '@shared/types'

// Состояние «Богатства PoE 2» (S70) в компаньоне. Источник — main (wealth:twoState + event:wealth.two); «что
// изменилось с прошлого снимка» перечитывается, когда появляется новый снимок. Ввод «+1 / +10 / поле» уходит в
// main сразу (снимок там пишется после паузы во вводе).

interface Poe2WealthStore {
  state: Poe2WealthState | null
  diff: WealthDiff | null
  init: () => void
  setManual: (name: string, qty: number) => Promise<void>
  setGold: (qty: number) => Promise<void>
  removeItem: (id: string) => Promise<void>
  removeTab: (id: string) => Promise<void>
  screenEdit: (tabId: string, key: string, edit: Poe2ScreenEdit) => Promise<void>
  screenDrop: (tabId?: string) => Promise<void>
  screenAccept: () => Promise<void>
}

let subscribed = false
let lastKey = ''

export const usePoe2WealthStore = create<Poe2WealthStore>((set) => {
  const apply = (state: Poe2WealthState): void => {
    set({ state })
    const key = state.latest ? `${state.latest.id}|${state.latest.at}` : ''
    if (key === lastKey) return
    lastKey = key
    void (state.latest ? window.overlayApi.wealth.poe2Diff() : Promise.resolve(null)).then((diff) => set({ diff }))
  }
  const api = () => window.overlayApi.wealth
  return {
    state: null,
    diff: null,
    init: () => {
      if (subscribed) return
      subscribed = true
      window.overlayApi.onWealthPoe2(apply)
      void api().poe2State().then(apply)
    },
    setManual: async (name, qty) => apply(await api().poe2SetManual(name, qty)),
    setGold: async (qty) => apply(await api().poe2SetGold(qty)),
    removeItem: async (id) => apply(await api().poe2RemoveItem(id)),
    removeTab: async (id) => apply(await api().poe2RemoveTab(id)),
    screenEdit: async (tabId, key, edit) => apply(await api().poe2ScreenEdit(tabId, key, edit)),
    screenDrop: async (tabId) => apply(await api().poe2ScreenDrop(tabId)),
    screenAccept: async () => apply(await api().poe2ScreenAccept())
  }
})
