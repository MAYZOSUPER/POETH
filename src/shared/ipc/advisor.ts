// IPC домена «Советник: что фармить» (S16). Стратегии и цены — только в main; сюда — стратегии с оценкой
// по ценам, обновление и метка стратегии для сессии фарма. Действий в игре нет и не будет.

import type { AdvisorFarmResult, AdvisorState } from '../types/advisor'

export const advisorChannels = {
  advisor: {
    state: 'advisor:state',
    refresh: 'advisor:refresh',
    startFarm: 'advisor:startFarm'
  }
} as const

export const advisorEvents = {
  advisorState: 'event:advisor.state'
} as const

export interface AdvisorIpcApi {
  advisor: {
    /** флаг разработки POETH_ADVISOR=1 (preload): вкладка видна, даже если features.advisor = false */
    devFlag: boolean
    state(): Promise<AdvisorState>
    /** перечитать strategies.json (могли обновиться данные) и цены */
    refresh(): Promise<AdvisorState>
    /** «Начать сессию фарма с этой стратегией»: новая сессия или метка на идущую */
    startFarm(strategyId: string): Promise<AdvisorFarmResult>
  }
  onAdvisorState(cb: (s: AdvisorState) => void): () => void
}
