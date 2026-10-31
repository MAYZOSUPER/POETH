// IPC домена «учёт богатства» (S11a). Запросы к сайту (сессия аккаунта) и цены — только в main;
// сюда приходят итоги, вкладки, график и фарм. Соглашение — как у других доменов
// (каналы 'wealth:<метод>', события 'event:wealth.<имя>'; уникальность — tests/ipc.test.ts).

import type {
  Poe2ScreenEdit,
  Poe2ValuableInput,
  Poe2WealthState,
  WealthAccountResult,
  WealthDiff,
  WealthOptions,
  WealthResult,
  WealthSnapshot,
  WealthState
} from '../types'

export const wealthChannels = {
  wealth: {
    state: 'wealth:state',
    refreshTabs: 'wealth:refreshTabs',
    setTabs: 'wealth:setTabs',
    setAccount: 'wealth:setAccount',
    setOptions: 'wealth:setOptions',
    snapshot: 'wealth:snapshot',
    startFarm: 'wealth:startFarm',
    stopFarm: 'wealth:stopFarm',
    detail: 'wealth:detail',
    diff: 'wealth:diff',
    // S70: «Богатство PoE 2» — ручной ввод, ценные предметы (окно цены), снимок вкладки с экрана
    poe2State: 'wealth:twoState',
    poe2SetManual: 'wealth:twoSetManual',
    poe2SetGold: 'wealth:twoSetGold',
    poe2AddItem: 'wealth:twoAddItem',
    poe2RemoveItem: 'wealth:twoRemoveItem',
    poe2RemoveTab: 'wealth:twoRemoveTab',
    poe2ScreenEdit: 'wealth:twoScreenEdit',
    poe2ScreenDrop: 'wealth:twoScreenDrop',
    poe2ScreenAccept: 'wealth:twoScreenAccept',
    poe2Diff: 'wealth:twoDiff'
  }
} as const

export const wealthEvents = {
  wealthState: 'event:wealth.state',
  /** S70: состояние «Богатства PoE 2» — только окну компаньона */
  wealthPoe2: 'event:wealth.two'
} as const

export interface WealthIpcApi {
  wealth: {
    state(): Promise<WealthState>
    /** перечитать список вкладок с сайта (1 запрос) */
    refreshTabs(): Promise<WealthResult>
    /** выбрать вкладки (id) для снимков текущей лиги */
    setTabs(ids: string[]): Promise<WealthResult>
    /** имя аккаунта 'Name#1234'; null/'' — брать из сессии сайта */
    setAccount(name: string | null): Promise<WealthAccountResult>
    setOptions(patch: Partial<WealthOptions>): Promise<WealthState>
    /** «Обновить»: снимок сейчас, не чаще раза в минуту (столько запросов к сайту, сколько выбрано вкладок) */
    snapshot(): Promise<WealthResult>
    /** «Начать сессию» — снимок-точка отсчёта, дальше авто-снимки */
    startFarm(): Promise<WealthResult>
    /** «Стоп» — финальный снимок сессии */
    stopFarm(): Promise<WealthResult>
    /** детали снимка (последнего, если id не задан); null — деталей уже нет */
    detail(id?: string): Promise<WealthSnapshot | null>
    /** «что прибавилось»: по умолчанию прошлый снимок → последний; fromId 'session' — от начала сессии */
    diff(fromId?: string, toId?: string): Promise<WealthDiff | null>

    // ---- «Богатство PoE 2» (S70): API тайника у PoE 2 нет — источники вводит игрок
    poe2State(): Promise<Poe2WealthState>
    /** ручной ввод валюты: штук (0 — убрать строку); снимок — после паузы во вводе */
    poe2SetManual(name: string, qty: number): Promise<Poe2WealthState>
    /** золото — только вручную, в итог в exalted не входит */
    poe2SetGold(qty: number): Promise<Poe2WealthState>
    /** ценный предмет из окна цены PoE 2 (Ctrl+D → «Добавить в богатство»): цена — та, что показало окно */
    poe2AddItem(item: Poe2ValuableInput): Promise<{ ok: true; id: string } | { ok: false }>
    poe2RemoveItem(id: string): Promise<Poe2WealthState>
    /** убрать принятую вкладку снимка */
    poe2RemoveTab(id: string): Promise<Poe2WealthState>
    /** карточка снимка вкладки: правка числа строки или выбор предмета из одинаковых по рисунку */
    poe2ScreenEdit(tabId: string, key: string, edit: Poe2ScreenEdit): Promise<Poe2WealthState>
    /** «Переснять» вкладку (tabId) или отменить весь сеанс снимка (без аргумента) */
    poe2ScreenDrop(tabId?: string): Promise<Poe2WealthState>
    /** «Принять»: вкладки сеанса → источник «Снимок вкладок» → снимок богатства */
    poe2ScreenAccept(): Promise<Poe2WealthState>
    /** «что изменилось»: по умолчанию прошлый снимок → последний; fromId 'session' — от начала сессии */
    poe2Diff(fromId?: string, toId?: string): Promise<WealthDiff | null>
  }
  onWealthState(cb: (s: WealthState) => void): () => void
  onWealthPoe2(cb: (s: Poe2WealthState) => void): () => void
}
