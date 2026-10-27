import { create } from 'zustand'
import type { CapturedItem, OverlayFocusState, OverlayStatus, UiLang } from '@shared/types'

// Состояние страницы игрового оверлея (overlay.html, S1). Компаньон сюда не ходит —
// у него свой useAppStore. Виджеты этапов (S4/S6/S8) держат свои данные в своих сторах,
// а отсюда берут общее: фокус, язык интерфейса, последний захваченный предмет.

interface OverlayStore {
  ready: boolean
  /** язык интерфейса (Settings.uiLang) */
  lang: UiLang
  /** акселератор overlayToggle — для подсказок ('Shift+Space') */
  toggleKey: string
  focus: OverlayFocusState
  status: OverlayStatus | null
  /** предмет для демо-виджета «текст предмета» (null — виджет закрыт) */
  item: CapturedItem | null

  /** Загрузить состояние и подписаться на события main; возвращает отписку. */
  init: () => Promise<() => void>
  /** Перечитать язык и хоткей из настроек (их меняют в окне компаньона). */
  refreshSettings: () => Promise<void>
  dismissItem: () => void
}

const api = (): Window['overlayApi'] => window.overlayApi

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  ready: false,
  lang: 'ru',
  toggleKey: 'Shift+Space',
  focus: { game: false, overlay: false, usingHotkey: false },
  status: null,
  item: null,

  init: async () => {
    const offs = [
      api().onOverlayFocus((focus) => {
        set({ focus })
        // оверлей активировали — самое время подтянуть свежие настройки
        if (focus.overlay) void get().refreshSettings()
      }),
      api().onOverlayStatus((status) => set({ status })),
      api().onItemCaptured((item) => set({ item })),
      api().onOverlayAutoHide(() => set({ item: null }))
    ]
    const [state] = await Promise.all([api().overlay.getState(), get().refreshSettings()])
    set({ ready: true, focus: state.focus, status: state.status, item: get().item ?? state.lastItem })
    return () => offs.forEach((off) => off())
  },

  refreshSettings: async () => {
    const s = await api().settings.get()
    set({ lang: s.uiLang, toggleKey: s.hotkeys.overlayToggle?.accel ?? '' })
  },

  dismissItem: () => set({ item: null })
}))
