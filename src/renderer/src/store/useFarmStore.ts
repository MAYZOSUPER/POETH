import { create } from 'zustand'
import type {
  FarmConfigPatch,
  FarmFindInput,
  FarmFindResult,
  FarmLogStatus,
  FarmStartOptions,
  FarmState,
  FarmStopOptions
} from '@shared/types/farm'

// Трекер карт и сессия фарма (S11b; PoE 2 — S69) в окне — компаньон (панель «Карты») и оверлей (виджет).
// Состояние — из main (farm:state + событие farmChanged) для запущенной игры; кнопки сессии — в main.

interface FarmStore {
  ready: boolean
  state: FarmState | null
  log: FarmLogStatus | null
  /** кнопка сессии в процессе (защита от двойного клика) */
  busy: boolean

  init: () => Promise<() => void>
  /** PoE 2 — с выбором из диалога «Чем отметить начало?» */
  start: (opts?: FarmStartOptions) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  /** PoE 2 — с выбором из диалога «Как посчитать прибыль?» */
  stop: (opts?: FarmStopOptions) => Promise<void>
  setConfig: (patch: FarmConfigPatch) => Promise<void>
  removeRun: (id: string) => Promise<void>
  clear: () => Promise<void>
  /** PoE 2: «+ находка» к забегу; состояние придёт событием farmChanged */
  addFind: (input: FarmFindInput) => Promise<FarmFindResult>
  removeFind: (runId: string, findId: string) => Promise<void>
}

const api = () => window.overlayApi

let subscribed: Promise<() => void> | null = null
let users = 0

export const useFarmStore = create<FarmStore>((set, get) => {
  const run = async (fn: () => Promise<FarmState>): Promise<void> => {
    if (get().busy) return
    set({ busy: true })
    try {
      set({ state: await fn() })
    } finally {
      set({ busy: false })
    }
  }
  return {
    ready: false,
    state: null,
    log: null,
    busy: false,

    // несколько компонентов (панель, виджет) — одна подписка на окно
    init: async () => {
      users += 1
      if (!subscribed) {
        subscribed = (async () => {
          const offs = [
            api().onFarmChanged((state) => set({ state })),
            api().onFarmLog((log) => set({ log }))
          ]
          const [state, log] = await Promise.all([api().farm.state(), api().farm.logStatus()])
          set({ state, log, ready: true })
          return () => offs.forEach((off) => off())
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
    start: (opts) => run(() => api().farm.start(opts)),
    pause: () => run(() => api().farm.pause()),
    resume: () => run(() => api().farm.resume()),
    stop: (opts) => run(() => api().farm.stop(opts)),
    setConfig: (patch) => run(() => api().farm.setConfig(patch)),
    removeRun: (id) => run(() => api().farm.removeRun(id)),
    clear: () => run(() => api().farm.clear()),
    addFind: (input) => api().farm.addFind(input),
    removeFind: (runId, findId) => run(() => api().farm.removeFind(runId, findId))
  }
})

/** Время тикает раз в секунду, пока что-то идёт (таймер карты или сессии). */
export function farmTicking(state: FarmState | null): boolean {
  return !!state && (state.ticking || (!!state.session && state.session.pausedAt === null))
}
