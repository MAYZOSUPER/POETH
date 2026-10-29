import { create } from 'zustand'
import type { ItemCheckResult, ItemFlipConfig, ItemFlipState, UniqueTier } from '@shared/types'
import { ITEMFLIP_RELEASED, itemFlipOn } from '@shared/flip/items/flag'
import { GAMES, type GameId } from '@shared/games'

// Состояние подвкладки «Обмен → Предметы» (S33). Источник — main (flip:itemsState + event:flip.items): снимок цен
// poe.ninja, тиры, 6L, настройка k и свои уники. Здесь — только вид (режим, поиск, выбранная строка) и итоги
// проверок «Проверить сейчас» до перезапуска. Проверка — одна кнопка, один поиск; повторов по таймеру нет.

export type ItemsMode = 'deals' | 'tiers' | 'six'
export type WatchState = 'busy' | 'done' | 'dup' | 'fail'

interface ItemsStore {
  /** подвкладка «Обмена»: валюта (S13) или предметы */
  sub: 'currency' | 'items'
  setSub: (sub: 'currency' | 'items') => void
  state: ItemFlipState | null
  busy: boolean
  mode: ItemsMode
  q: string
  tier: UniqueTier | 'all'
  /** «Только надёжные» в тирах: без строк с малой выборкой */
  sure: boolean
  selected: string | null
  checks: Record<string, ItemCheckResult>
  checking: Record<string, boolean>
  watch: Record<string, WatchState>
  init: () => void
  refresh: () => Promise<void>
  setConfig: (patch: Partial<ItemFlipConfig>) => Promise<void>
  setView: (patch: Partial<Pick<ItemsStore, 'mode' | 'q' | 'tier' | 'sure'>>) => void
  pick: (id: string | null) => void
  check: (id: string) => Promise<void>
  watchRow: (id: string) => Promise<void>
  togglePick: (id: string) => Promise<void>
}

let subscribed = false

/** Предметы включены: PoE 1 и (выпущено или POETH_ITEMFLIP=1 из preload). */
export function itemsEnabled(game: GameId): boolean {
  const dev = (globalThis as { overlayApi?: { flip?: { itemsDevFlag?: boolean } } }).overlayApi?.flip?.itemsDevFlag === true
  return itemFlipOn(GAMES[game], dev, ITEMFLIP_RELEASED)
}

export const useItemsStore = create<ItemsStore>((set, get) => ({
  sub: 'currency',
  setSub: (sub) => {
    set({ sub })
    if (sub === 'items') get().init()
  },
  state: null,
  busy: false,
  mode: 'deals',
  q: '',
  tier: 'all',
  sure: false,
  selected: null,
  checks: {},
  checking: {},
  watch: {},
  init: () => {
    if (subscribed) return
    subscribed = true
    const api = window.overlayApi
    api.onFlipItems((state) => set({ state }))
    void api.flip.itemsState().then((state) => set({ state }))
  },
  refresh: async () => {
    set({ busy: true })
    try {
      set({ state: await window.overlayApi.flip.itemsRefresh() })
    } finally {
      set({ busy: false })
    }
  },
  setConfig: async (patch) => {
    set({ state: await window.overlayApi.flip.itemsConfig(patch) })
  },
  setView: (patch) => set(patch),
  pick: (selected) => set({ selected }),
  check: async (id) => {
    if (get().checking[id]) return
    set((s) => ({ checking: { ...s.checking, [id]: true }, selected: id }))
    try {
      const res = await window.overlayApi.flip.itemsCheck(id)
      set((s) => ({ checks: { ...s.checks, [id]: res } }))
    } finally {
      set((s) => ({ checking: { ...s.checking, [id]: false } }))
    }
  },
  watchRow: async (id) => {
    const cur = get().watch[id]
    if (cur === 'busy' || cur === 'done') return
    set((s) => ({ watch: { ...s.watch, [id]: 'busy' } }))
    let next: WatchState = 'fail'
    try {
      const w = await window.overlayApi.flip.itemsWatch(id)
      if (w.ok) {
        // тот же путь, что «Следить (live)» в окне цены (S6)
        const r = await window.overlayApi.live.add(w.siteUrl, w.title)
        next = r.ok ? 'done' : r.error === 'duplicate' ? 'dup' : 'fail'
      }
    } catch {
      next = 'fail'
    }
    set((s) => ({ watch: { ...s.watch, [id]: next } }))
  },
  togglePick: async (id) => {
    const cfg = get().state?.config
    if (!cfg) return
    const picks = cfg.picks.includes(id) ? cfg.picks.filter((p) => p !== id) : [...cfg.picks, id]
    await get().setConfig({ picks })
  }
}))
