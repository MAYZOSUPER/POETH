// IPC домена «учёт богатства» (S11a). Запросы к сайту (сессия аккаунта) и цены — только в main;
// сюда приходят итоги, вкладки, график и фарм. Соглашение — как у других доменов
// (каналы 'wealth:<метод>', события 'event:wealth.<имя>'; уникальность — tests/ipc.test.ts).

import type {
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
    diff: 'wealth:diff'
  }
} as const

export const wealthEvents = {
  wealthState: 'event:wealth.state'
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
  }
  onWealthState(cb: (s: WealthState) => void): () => void
}
