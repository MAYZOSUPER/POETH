// IPC домена «помощник по флиппингу» (S13). Фид обмена и расчёт — только в main; сюда — маршруты, курс и
// фильтры. Ордера игрок выставляет сам у Фаустуса — каналов «выставить ордер» нет и не будет.

import type { FlipAlert, FlipFilters, FlipOptions, FlipState } from '../types'

export const flipChannels = {
  flip: {
    state: 'flip:state',
    refresh: 'flip:refresh',
    setFilters: 'flip:setFilters',
    setOptions: 'flip:setOptions'
  }
} as const

export const flipEvents = {
  flipState: 'event:flip.state',
  /** курс divine вышел из коридора недели — тост в оверлее (если включено) */
  flipAlert: 'event:flip.alert'
} as const

export interface FlipIpcApi {
  flip: {
    state(): Promise<FlipState>
    /** подтянуть недостающие часы фида и пересчитать */
    refresh(): Promise<FlipState>
    setFilters(patch: Partial<FlipFilters>): Promise<FlipState>
    /** «Сообщить, если выйдет из коридора» */
    setOptions(patch: Partial<FlipOptions>): Promise<FlipState>
  }
  onFlipState(cb: (s: FlipState) => void): () => void
  onFlipAlert(cb: (a: FlipAlert) => void): () => void
}
