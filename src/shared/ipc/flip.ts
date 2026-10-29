// IPC домена «помощник по флиппингу» (S13). Фид обмена и расчёт — только в main; сюда — маршруты, курс и
// фильтры. Ордера игрок выставляет сам у Фаустуса — каналов «выставить ордер» нет и не будет.

import type { FlipAlert, FlipBookEvent, FlipFilters, FlipOptions, FlipState } from '../types'

export const flipChannels = {
  flip: {
    state: 'flip:state',
    refresh: 'flip:refresh',
    setFilters: 'flip:setFilters',
    setOptions: 'flip:setOptions',
    /** последние чтения стакана из игры (S28) — для вкладки, открытой после хоткея */
    bookRecent: 'flip:bookRecent'
  }
} as const

export const flipEvents = {
  flipState: 'event:flip.state',
  /** курс divine вышел из коридора недели — тост в оверлее (если включено) */
  flipAlert: 'event:flip.alert',
  /** стакан «Курс / Кол-во» считан с экрана по хоткею или не удалось (S28) */
  flipBook: 'event:flip.book'
} as const

export interface FlipIpcApi {
  flip: {
    state(): Promise<FlipState>
    /** подтянуть недостающие часы фида и пересчитать */
    refresh(): Promise<FlipState>
    setFilters(patch: Partial<FlipFilters>): Promise<FlipState>
    /** «Сообщить, если выйдет из коридора» */
    setOptions(patch: Partial<FlipOptions>): Promise<FlipState>
    /** последние чтения стакана, старые сначала (обе ноги могли считать до открытия вкладки) */
    bookRecent(): Promise<FlipBookEvent[]>
  }
  onFlipState(cb: (s: FlipState) => void): () => void
  onFlipAlert(cb: (a: FlipAlert) => void): () => void
  onFlipBook(cb: (e: FlipBookEvent) => void): () => void
}
