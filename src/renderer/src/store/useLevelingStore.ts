import { create } from 'zustand'
import type { LevelingAction, LevelingConfig, LevelingData, LevelingState, LevelingVariant } from '@shared/types/leveling'
import { flattenRoute, type FlatStep } from '@shared/leveling/route'

// Прокачка PoE1 (S14) в окне — компаньон (вкладка «Кампания») и оверлей (гид). Данные маршрута — один раз
// на окно (leveling:data), состояние — из main (leveling:state + событие levelingChanged).

interface LevelingStore {
  ready: boolean
  data: LevelingData | null
  state: LevelingState | null
  /** плоский маршрут текущего варианта */
  flat: FlatStep[]

  init: () => Promise<() => void>
  act: (a: LevelingAction) => Promise<void>
  setVariant: (v: Partial<LevelingVariant>) => Promise<void>
  setConfig: (p: Partial<LevelingConfig>) => Promise<void>
  createProfile: (name: string) => Promise<void>
  selectProfile: (id: string) => Promise<void>
  updateProfile: (id: string, patch: { name?: string; className?: string | null; character?: string | null }) => Promise<void>
  removeProfile: (id: string) => Promise<void>
}

const api = () => window.overlayApi.leveling

let subscribed: Promise<() => void> | null = null
let users = 0
let flatKey = ''

export const useLevelingStore = create<LevelingStore>((set, get) => {
  const apply = (state: LevelingState): void => {
    const data = get().data
    const key = `${state.progress.variant.leagueStart}|${state.progress.variant.bandit}`
    if (data && key !== flatKey) {
      flatKey = key
      set({ state, flat: flattenRoute(data, state.progress.variant) })
    } else set({ state })
  }
  const run = async (fn: () => Promise<LevelingState>): Promise<void> => apply(await fn())
  return {
    ready: false,
    data: null,
    state: null,
    flat: [],

    init: async () => {
      users += 1
      if (!subscribed) {
        subscribed = (async () => {
          const off = window.overlayApi.onLevelingChanged(apply)
          const [data, state] = await Promise.all([api().data(), api().state()])
          flatKey = ''
          set({ data })
          apply(state)
          set({ ready: true })
          return off
        })()
      }
      const off = await subscribed
      return () => {
        users -= 1
        if (users === 0) {
          off()
          subscribed = null
          set({ ready: false })
        }
      }
    },
    act: (a) => run(() => api().act(a)),
    setVariant: (v) => run(() => api().setVariant(v)),
    setConfig: (p) => run(() => api().setConfig(p)),
    createProfile: (name) => run(() => api().profileCreate(name)),
    selectProfile: (id) => run(() => api().profileSelect(id)),
    updateProfile: (id, patch) => run(() => api().profileUpdate(id, patch)),
    removeProfile: (id) => run(() => api().profileRemove(id))
  }
})
