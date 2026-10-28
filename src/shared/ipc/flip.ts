// IPC домена «помощник по флиппингу» (S13). Фид обмена и расчёт — только в main; сюда — маршруты, курс и
// фильтры. Ордера игрок выставляет сам у Фаустуса — каналов «выставить ордер» нет и не будет.

import type { FlipFilters, FlipState } from '../types'

export const flipChannels = {
  flip: {
    state: 'flip:state',
    refresh: 'flip:refresh',
    setFilters: 'flip:setFilters'
  }
} as const

export const flipEvents = {
  flipState: 'event:flip.state'
} as const

export interface FlipIpcApi {
  flip: {
    state(): Promise<FlipState>
    /** подтянуть недостающие часы фида и пересчитать */
    refresh(): Promise<FlipState>
    setFilters(patch: Partial<FlipFilters>): Promise<FlipState>
  }
  onFlipState(cb: (s: FlipState) => void): () => void
}
