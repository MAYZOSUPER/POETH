// IPC домена «помощник по флиппингу» (S13). Фид обмена и расчёт — только в main; сюда — маршруты, курс и
// фильтры. Ордера игрок выставляет сам у Фаустуса — каналов «выставить ордер» нет и не будет.

import type {
  FlipAlert,
  FlipBookEvent,
  FlipFilters,
  FlipOptions,
  FlipState,
  ItemCheckResult,
  ItemFlipConfig,
  ItemFlipState,
  ItemWatchResult
} from '../types'

export const flipChannels = {
  flip: {
    state: 'flip:state',
    refresh: 'flip:refresh',
    setFilters: 'flip:setFilters',
    setOptions: 'flip:setOptions',
    /** последние чтения стакана из игры (S28) — для вкладки, открытой после хоткея */
    bookRecent: 'flip:bookRecent',
    /** S33: «Обмен → Предметы» — цены уников (снимок poe.ninja), тиры, 6L */
    itemsState: 'flip:itemsState',
    itemsRefresh: 'flip:itemsRefresh',
    itemsConfig: 'flip:itemsConfig',
    /** «Проверить сейчас»: один поиск + fetch до 10 лотов */
    itemsCheck: 'flip:itemsCheck',
    /** «Следить»: адрес того же поиска для live search */
    itemsWatch: 'flip:itemsWatch'
  }
} as const

export const flipEvents = {
  flipState: 'event:flip.state',
  /** курс divine вышел из коридора недели — тост в оверлее (если включено) */
  flipAlert: 'event:flip.alert',
  /** стакан «Курс / Кол-во» считан с экрана по хоткею или не удалось (S28) */
  flipBook: 'event:flip.book',
  /** S33: состояние «Предметов» (снимок цен обновился, сменилась лига) */
  flipItems: 'event:flip.items'
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
    /** S33: POETH_ITEMFLIP=1 (подвкладка «Предметы» скрыта в релизе) */
    itemsDevFlag: boolean
    itemsState(): Promise<ItemFlipState>
    /** перечитать снимок цен (условный запрос к GitHub) и курсы фида */
    itemsRefresh(): Promise<ItemFlipState>
    itemsConfig(patch: Partial<ItemFlipConfig>): Promise<ItemFlipState>
    /** один поиск на трейде (k × цена poe.ninja) и до 10 лотов; k — не из настроек (не сохраняется) */
    itemsCheck(rowId: string, k?: number): Promise<ItemCheckResult>
    itemsWatch(rowId: string, k?: number): Promise<ItemWatchResult>
  }
  onFlipState(cb: (s: FlipState) => void): () => void
  onFlipAlert(cb: (a: FlipAlert) => void): () => void
  onFlipBook(cb: (e: FlipBookEvent) => void): () => void
  onFlipItems(cb: (s: ItemFlipState) => void): () => void
}
