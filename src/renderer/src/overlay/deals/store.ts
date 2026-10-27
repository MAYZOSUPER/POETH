import { create } from 'zustand'
import type {
  DealActionResult,
  DealCardAction,
  DealsSettings,
  DealsState,
  SoundSettings
} from '@shared/types'
import { playChime } from '../../panels/deals/sound'

// Состояние карточек сделок на странице оверлея (S8, фаза 2). История и настройки менеджера —
// из main (deals:state + событие dealsChanged); Settings.deals/sound/ui перечитываются при смене
// фокуса (игрок вернулся в игру из компаньона) и на каждую новую сделку.

interface OverlaySettingsSlice {
  deals: DealsSettings
  sound: SoundSettings
  simpleMode: boolean
}

interface CardNote {
  kind: 'ok' | 'error'
  key: string
}

interface DealsOverlay {
  ready: boolean
  state: DealsState | null
  settings: OverlaySettingsSlice | null
  /** сделка, чья ячейка подсвечена в тайнике */
  highlightId: string | null
  /** идёт калибровка кликами */
  calibrating: boolean
  /** короткие сообщения на карточке после нажатия (ушло / игра не в фокусе…) */
  notes: Record<string, CardNote>
  /** сейчас выполняется команда этой карточки (защита от двойного клика) */
  busyId: string | null

  init: () => Promise<() => void>
  refreshSettings: () => Promise<void>
  act: (id: string, action: DealCardAction) => Promise<DealActionResult | null>
  hide: (id: string) => Promise<void>
  ignore: (id: string) => Promise<void>
  toggleHighlight: (id: string) => void
  startCalibration: () => void
  endCalibration: () => void
}

const api = () => window.overlayApi

const NOTE_MS = 3500
const noteTimers = new Map<string, number>()

export const useDealsOverlay = create<DealsOverlay>((set, get) => ({
  ready: false,
  state: null,
  settings: null,
  highlightId: null,
  calibrating: false,
  notes: {},
  busyId: null,

  init: async () => {
    const offs = [
      api().onDealsChanged((state) => set({ state })),
      api().onDealsNew((deal) => {
        void get()
          .refreshSettings()
          .then(() => {
            const s = get().settings
            const cfg = get().state?.config
            if (!s?.deals.enabled || deal.dir !== 'in' || deal.status !== 'new') return
            // звук — по настройке менеджера и общей громкости; подсветка — свежей входящей
            if (cfg?.sound && s.sound.enabled) playChime(s.sound.volume)
            if (cfg?.highlightStash && deal.pos) set({ highlightId: deal.id })
          })
      }),
      api().onOverlayFocus(() => void get().refreshSettings()),
      api().onDealsCalibrate(() => get().startCalibration()),
      // Esc в активном оверлее — отмена калибровки
      api().onOverlayDismiss(() => {
        if (get().calibrating) set({ calibrating: false })
      })
    ]
    const [state] = await Promise.all([api().deals.state(), get().refreshSettings()])
    set({ state, ready: true })
    return () => offs.forEach((off) => off())
  },

  refreshSettings: async () => {
    const s = await api().settings.get()
    set({ settings: { deals: s.deals, sound: s.sound, simpleMode: s.ui.simpleMode } })
  },

  act: async (id, action) => {
    if (get().busyId) return null
    set({ busyId: id })
    try {
      const r = await api().deals.action(id, action)
      set({ state: r.state })
      const note: CardNote =
        r.result === 'ok' ? { kind: 'ok', key: 'deals.card.sent' } : { kind: 'error', key: `deals.card.err.${r.result}` }
      set((st) => ({ notes: { ...st.notes, [id]: note } }))
      const old = noteTimers.get(id)
      if (old) window.clearTimeout(old)
      noteTimers.set(
        id,
        window.setTimeout(() => {
          noteTimers.delete(id)
          set((st) => {
            const notes = { ...st.notes }
            delete notes[id]
            return { notes }
          })
        }, NOTE_MS)
      )
      return r
    } finally {
      set({ busyId: null })
    }
  },

  hide: async (id) => {
    set({ state: await api().deals.hideCard(id), highlightId: get().highlightId === id ? null : get().highlightId })
  },

  ignore: async (id) => {
    await api().deals.setStatus(id, 'ignored')
    await get().hide(id)
  },

  toggleHighlight: (id) => set({ highlightId: get().highlightId === id ? null : id }),

  startCalibration: () => set({ calibrating: true }),
  endCalibration: () => set({ calibrating: false })
}))
