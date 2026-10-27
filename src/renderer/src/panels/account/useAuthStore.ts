import { create } from 'zustand'
import type { AuthStatus, PasteSessionError } from '@shared/types'

// Состояние входа в renderer. Здесь только статус — значения cookies сюда не приходят.

interface AuthState {
  status: AuthStatus | null
  busy: boolean
  /** итог последней вставки POESESSID: 'ok' или код ошибки */
  pasteResult: 'ok' | PasteSessionError | null
  init: () => void
  login: () => Promise<void>
  logout: () => Promise<void>
  recheck: () => Promise<void>
  /** отправить POESESSID в main (обратно значение не возвращается) */
  paste: (value: string) => Promise<boolean>
}

let subscribed = false

export const useAuthStore = create<AuthState>((set, get) => ({
  status: null,
  busy: false,
  pasteResult: null,

  init: () => {
    if (subscribed) return
    subscribed = true
    const api = window.overlayApi
    api.onAuthStatus((status) => set({ status }))
    void api.auth.status().then((status) => set({ status }))
  },

  login: async () => {
    await window.overlayApi.auth.login()
  },

  logout: async () => {
    set({ busy: true })
    try {
      const status = await window.overlayApi.auth.logout()
      set({ status, pasteResult: null })
    } finally {
      set({ busy: false })
    }
  },

  recheck: async () => {
    if (get().busy) return
    set({ busy: true })
    try {
      set({ status: await window.overlayApi.auth.recheck() })
    } finally {
      set({ busy: false })
    }
  },

  paste: async (value) => {
    set({ busy: true, pasteResult: null })
    try {
      const res = await window.overlayApi.auth.pasteSession(value)
      set({ status: res.status, pasteResult: res.ok ? 'ok' : res.error })
      return res.ok
    } finally {
      set({ busy: false })
    }
  }
}))
