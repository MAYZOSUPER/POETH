import { create } from 'zustand'
import type { LiveHit, LiveHitEvent, LiveSnapshot } from '@shared/types'

// Тосты live search в оверлее (S6): свежий сверху, видно 3, остальные — «Ещё N».
// Пауза по лимиту (429) — отдельный жёлтый тост с отсчётом до самого раннего продолжения.

export const TOAST_LIFE_MS = 12_000
export const VISIBLE_TOASTS = 3
const MAX_TOASTS = 20

export interface LiveToast {
  key: string
  hit: LiveHit
  /** new — находка; done — whisper вставлен в чат; err — не получилось (note) */
  state: 'new' | 'done' | 'err'
  note?: string
}

interface LiveToastStore {
  toasts: LiveToast[]
  expanded: boolean
  /** самая ранняя пауза по лимиту (ms epoch) или null */
  pausedUntil: number | null
  /** пользователь закрыл тост паузы — до этого момента не показывать */
  pausedHiddenUntil: number
  push: (e: LiveHitEvent) => void
  remove: (key: string) => void
  update: (key: string, patch: Partial<LiveToast>) => void
  setExpanded: (v: boolean) => void
  fromSnapshot: (s: LiveSnapshot) => void
  hidePaused: () => void
}

export const useLiveToasts = create<LiveToastStore>((set, get) => ({
  toasts: [],
  expanded: false,
  pausedUntil: null,
  pausedHiddenUntil: 0,

  push: (e) => {
    if (!e.toast) return
    set((s) => ({
      toasts: [{ key: e.hit.key, hit: e.hit, state: 'new' as const }, ...s.toasts.filter((t) => t.key !== e.hit.key)].slice(
        0,
        MAX_TOASTS
      )
    }))
  },

  remove: (key) =>
    set((s) => {
      const toasts = s.toasts.filter((t) => t.key !== key)
      return { toasts, expanded: s.expanded && toasts.length > VISIBLE_TOASTS }
    }),

  update: (key, patch) => set((s) => ({ toasts: s.toasts.map((t) => (t.key === key ? { ...t, ...patch } : t)) })),

  setExpanded: (expanded) => set({ expanded }),

  fromSnapshot: (snap) => {
    const now = Date.now()
    const until = snap.options.enabled
      ? snap.searches
          .filter((x) => x.state === 'ratelimited' && x.retryAt && x.retryAt > now)
          .reduce<number | null>((m, x) => (m === null ? (x.retryAt as number) : Math.min(m, x.retryAt as number)), null)
      : null
    if (until !== get().pausedUntil) set({ pausedUntil: until })
  },

  hidePaused: () => set((s) => ({ pausedHiddenUntil: s.pausedUntil ?? 0 }))
}))
