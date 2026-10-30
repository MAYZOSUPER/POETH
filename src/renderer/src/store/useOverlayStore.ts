import { create } from 'zustand'
import type { GameId } from '@shared/games'
import { setCurrencyGame } from '../components/Currency'
import type {
  CapturedItem,
  OverlayFocusState,
  OverlayNotice,
  OverlayStatus,
  PopupPoint,
  PricePopupPosition,
  UiLang
} from '@shared/types'

/** Сколько висит уведомление поверх игры (с кнопкой — дольше, чтобы успеть нажать). */
const NOTICE_MS = 3500
const NOTICE_ACTION_MS = 9000

let noticeSeq = 0

// Состояние страницы игрового оверлея (overlay.html, S1). Компаньон сюда не ходит —
// у него свой useAppStore. Виджеты этапов (S4/S6/S8) держат свои данные в своих сторах,
// а отсюда берут общее: фокус, язык интерфейса, последний захваченный предмет и сигнал
// «закрыть всплывающие окна» (popupDismissSeq).

interface OverlayStore {
  ready: boolean
  /** язык интерфейса (Settings.uiLang) */
  lang: UiLang
  /** S47: игра, с которой запущен POETH (Settings.game; смена — перезапуск) — окно цены PoE1 или PoE2 */
  game: GameId | null
  /** акселератор overlayToggle — для подсказок ('Shift+Space') */
  toggleKey: string
  /** акселератор priceCheck ('Control+D') — в активном оверлее закрывает окно цены */
  priceCheckKey: string
  /** «Позиция окна цены» для окон слоя popup (Settings.overlay.pricePosition) */
  pricePosition: PricePopupPosition
  /** куда окно цены перетащили (Settings.overlay.priceWindowPos) — для 'saved' */
  priceWindowPos: PopupPoint | null
  focus: OverlayFocusState
  status: OverlayStatus | null
  /** предмет для демо-виджета «текст предмета» (null — виджет закрыт) */
  item: CapturedItem | null
  /**
   * Растёт, когда всплывающие окна (слой popup) надо закрыть: Esc, клик мимо окна,
   * курсор ушёл от предмета. Виджеты этапов подписываются на смену значения.
   */
  popupDismissSeq: number
  /** короткие уведомления (слой toasts), исчезают сами через NOTICE_MS */
  notices: { id: number; notice: OverlayNotice }[]

  /** Загрузить состояние и подписаться на события main; возвращает отписку. */
  init: () => Promise<() => void>
  /** Перечитать язык и хоткей из настроек (их меняют в окне компаньона). */
  refreshSettings: () => Promise<void>
  /** Закрыть всплывающие окна (без возврата фокуса — это делает вызывающий). */
  dismissPopups: () => void
  /** Окно цены перетащили (p) или вернули к курсору (null): сразу на экране и в настройках. */
  setPricePlacement: (p: PopupPoint | null) => void
}

const api = (): Window['overlayApi'] => window.overlayApi

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  ready: false,
  lang: 'ru',
  game: null,
  toggleKey: 'Shift+Space',
  priceCheckKey: 'Control+D',
  pricePosition: 'cursor',
  priceWindowPos: null,
  focus: { game: false, overlay: false, usingHotkey: false },
  status: null,
  item: null,
  popupDismissSeq: 0,
  notices: [],

  init: async () => {
    const offs = [
      api().onOverlayFocus((focus) => {
        set({ focus })
        // оверлей активировали — самое время подтянуть свежие настройки
        if (focus.overlay) void get().refreshSettings()
      }),
      api().onOverlayStatus((status) => set({ status })),
      // повторный Ctrl+D по тому же предмету закрывает окно (макет: «Закрытие»);
      // настройки (позиция окна цены) могли поменять в компаньоне — перечитать
      api().onItemCaptured((item) => {
        set({ item: get().item?.text === item.text ? null : item })
        void get().refreshSettings()
      }),
      api().onOverlayAutoHide(() => get().dismissPopups()),
      api().onOverlayDismiss(() => get().dismissPopups()),
      api().onOverlayNotice((notice) => {
        const id = ++noticeSeq
        set({ notices: [...get().notices.slice(-2), { id, notice }] })
        window.setTimeout(() => set({ notices: get().notices.filter((n) => n.id !== id) }), notice.action ? NOTICE_ACTION_MS : NOTICE_MS)
      })
    ]
    const [state] = await Promise.all([api().overlay.getState(), get().refreshSettings()])
    set({ ready: true, focus: state.focus, status: state.status, item: get().item ?? state.lastItem })
    return () => offs.forEach((off) => off())
  },

  refreshSettings: async () => {
    const s = await api().settings.get()
    setCurrencyGame(s.game)
    set({
      lang: s.uiLang,
      game: s.game,
      toggleKey: s.hotkeys.overlayToggle?.accel ?? '',
      priceCheckKey: s.hotkeys.priceCheck?.accel ?? '',
      pricePosition: s.overlay?.pricePosition ?? 'cursor',
      priceWindowPos: s.overlay?.priceWindowPos ?? null
    })
  },

  dismissPopups: () => set((s) => ({ item: null, popupDismissSeq: s.popupDismissSeq + 1 })),

  setPricePlacement: (p) => {
    const overlay = p ? { pricePosition: 'saved' as const, priceWindowPos: p } : { pricePosition: 'cursor' as const, priceWindowPos: null }
    set(overlay)
    void api().settings.set({ overlay })
  }
}))
