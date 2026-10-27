import { create } from 'zustand'
import type { AuthStatus, FavData, FavLiveSnapshot, LeaguesState, Settings, TradeSiteState } from '@shared/types'
import { emptyFavorites } from '@shared/favorites/model'
import { useAppStore } from '../store/useAppStore'

// Состояние сайдбара трейд-окна (S5): избранное, страница сайта, live (S6), вход и лиги (S3).
// Настройки кладутся в useAppStore — от них берут язык useT/useLang.

/** Короткое сообщение под кнопками: ключ строки i18n + параметры. */
export type Notice = { key: string; params?: Record<string, string | number>; kind: 'ok' | 'warn' | 'bad'; at: number }

interface FavState {
  ready: boolean
  data: FavData
  site: TradeSiteState | null
  live: FavLiveSnapshot
  auth: AuthStatus | null
  leagues: LeaguesState | null
  notice: Notice | null
  /** развёрнутые папки (id) */
  open: Record<string, boolean>
  init: () => () => void
  refreshSettings: () => Promise<void>
  setNotice: (key: string, params?: Notice['params'], kind?: Notice['kind']) => void
  toggleFolder: (id: string, value?: boolean) => void
}

const api = (): Window['overlayApi'] => window.overlayApi
const OPEN_KEY = 'poeth.fav.open'

function loadOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function saveOpen(open: Record<string, boolean>): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(open))
  } catch {
    // нет хранилища — развёрнутость просто не запомнится
  }
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null

export const useFavStore = create<FavState>((set, get) => ({
  ready: false,
  data: emptyFavorites(),
  site: null,
  live: { available: false, states: {}, used: 0, max: 10 },
  auth: null,
  leagues: null,
  notice: null,
  open: loadOpen(),

  init: () => {
    const a = api()
    const unsubs = [
      a.onFavChanged((data) => set({ data })),
      a.onTradeSite((site) => set({ site })),
      a.onFavLive((live) => set({ live })),
      a.onAuthStatus((auth) => set({ auth })),
      a.onLeagues((leagues) => set({ leagues })),
      a.onTradeBlocked(({ host, external }) => {
        get().setNotice(external ? 'tw.blocked.external' : 'tw.blocked', { host }, external ? 'ok' : 'warn')
      })
    ]
    void (async () => {
      const [settings, data, site, live, auth, leagues] = await Promise.all([
        a.settings.get(),
        a.fav.list(),
        a.tradeWindow.state(),
        a.fav.live(),
        a.auth.status(),
        a.leagues.get().catch(() => null)
      ])
      useAppStore.setState({ settings })
      set({ ready: true, data, site, live, auth, leagues })
    })()
    const onFocus = (): void => void get().refreshSettings()
    window.addEventListener('focus', onFocus)
    return () => {
      for (const u of unsubs) u()
      window.removeEventListener('focus', onFocus)
    }
  },

  refreshSettings: async () => {
    const settings: Settings = await api().settings.get()
    useAppStore.setState({ settings })
    const leagues = await api()
      .leagues.get()
      .catch(() => null)
    set({ leagues })
  },

  setNotice: (key, params, kind = 'ok') => {
    if (noticeTimer) clearTimeout(noticeTimer)
    set({ notice: { key, params, kind, at: Date.now() } })
    noticeTimer = setTimeout(() => set({ notice: null }), 5000)
  },

  toggleFolder: (id, value) => {
    const open = { ...get().open, [id]: value ?? !get().open[id] }
    saveOpen(open)
    set({ open })
  }
}))
