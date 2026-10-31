import { create } from 'zustand'
import type { RumoursIpcApi } from '@shared/ipc/rumours'
import type { RumourMark, RumourPriceBook, RumoursData, RumoursUserState } from '@shared/types/rumours'
import { emptyRumoursUser } from '@shared/rumours/marks'

// «Слухи журнала» (S65): данные, выбор и пометки игрока, цены — одно состояние на страницу (компаньон или оверлей).
// Хранит всё main (userData/rumours.json); здесь копия и подписка на изменения из другого окна.

/** Мост домена: window.overlayApi.rumours (подключает лид в preload/index.ts; до этого — null). */
export function rumoursApi(): RumoursIpcApi | null {
  const api = (globalThis as { overlayApi?: Partial<RumoursIpcApi> }).overlayApi
  return api?.rumours && api.onRumoursState ? (api as RumoursIpcApi) : null
}

type Status = 'idle' | 'loading' | 'ready'

interface RumoursStore {
  status: Status
  data: RumoursData | null
  user: RumoursUserState
  prices: RumourPriceBook | null
  /** загрузить данные, выбор и цены (один раз на страницу; повторный вызов — только цены, из кэша main) */
  init(): Promise<void>
  setPicked(ids: string[]): Promise<void>
  add(id: string): Promise<void>
  remove(id: string): Promise<void>
  setMark(id: string, mark: RumourMark | null): Promise<void>
  refreshPrices(force?: boolean): Promise<void>
}

let unsub: (() => void) | null = null

export const useRumoursStore = create<RumoursStore>((set, get) => ({
  status: 'idle',
  data: null,
  user: emptyRumoursUser(),
  prices: null,

  async init() {
    const api = rumoursApi()
    if (!api) return
    if (get().status !== 'idle') return void get().refreshPrices()
    set({ status: 'loading' })
    if (!unsub) unsub = api.onRumoursState((user) => set({ user }))
    const [data, user] = await Promise.all([api.rumours.data(), api.rumours.state()])
    set({ status: 'ready', data, user })
    if (data.on) await get().refreshPrices()
  },

  async setPicked(ids) {
    const api = rumoursApi()
    if (api) set({ user: await api.rumours.setPicked(ids) })
  },

  async add(id) {
    const picked = get().user.picked
    if (picked.includes(id) || picked.length >= 6) return
    await get().setPicked([...picked, id])
  },

  async remove(id) {
    await get().setPicked(get().user.picked.filter((x) => x !== id))
  },

  async setMark(id, mark) {
    const api = rumoursApi()
    if (api) set({ user: await api.rumours.setMark(id, mark) })
  },

  async refreshPrices(force = false) {
    const api = rumoursApi()
    if (!api) return
    try {
      set({ prices: await api.rumours.prices(force) })
    } catch {
      // цены — подсказка: без них окно работает
    }
  }
}))
