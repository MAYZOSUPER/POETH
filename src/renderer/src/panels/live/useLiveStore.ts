import { create } from 'zustand'
import type { LiveAddError, LiveOptions, LiveSnapshot } from '@shared/types'

// Состояние вкладки Live (компаньон, S6). Источник — main (live:state + event:live.state).

interface LiveStore {
  snap: LiveSnapshot | null
  busy: boolean
  addError: LiveAddError | null
  /** поиск добавлен выключенным из-за лимита */
  addedOff: boolean
  /** id поиска, который упёрся в лимит при включении */
  limitId: string | null
  init: () => void
  add: (input: string, title: string) => Promise<boolean>
  remove: (id: string) => Promise<void>
  setEnabled: (id: string, on: boolean) => Promise<void>
  update: (id: string, patch: { title?: string; sound?: boolean }) => Promise<void>
  setOptions: (patch: Partial<LiveOptions>) => Promise<void>
}

let subscribed = false

export const useLiveStore = create<LiveStore>((set) => ({
  snap: null,
  busy: false,
  addError: null,
  addedOff: false,
  limitId: null,

  init: () => {
    if (subscribed) return
    subscribed = true
    const api = window.overlayApi
    api.onLiveState((snap) => set({ snap }))
    void api.live.state().then((snap) => set({ snap }))
  },

  add: async (input, title) => {
    set({ busy: true, addError: null, addedOff: false })
    try {
      const res = await window.overlayApi.live.add(input, title || undefined)
      if (!res.ok) {
        set({ addError: res.error })
        return false
      }
      set({ addedOff: !res.search.enabled, snap: await window.overlayApi.live.state() })
      return true
    } finally {
      set({ busy: false })
    }
  },

  remove: async (id) => {
    await window.overlayApi.live.remove(id)
  },

  setEnabled: async (id, on) => {
    const r = await window.overlayApi.live.setEnabled(id, on)
    set({ limitId: r === 'limit' ? id : null })
  },

  update: async (id, patch) => {
    await window.overlayApi.live.update(id, patch)
  },

  setOptions: async (patch) => {
    set({ snap: await window.overlayApi.live.setOptions(patch) })
  }
}))
