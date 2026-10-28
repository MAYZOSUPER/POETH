// IPC домена «Советник: что фармить» (S16, S17). Стратегии и цены — только в main; сюда — стратегии с оценкой
// по ценам, обновление, метка стратегии для сессии фарма и свои стратегии (S17): редактор, «Поделиться»,
// «Импорт». Код POETH1 раскрывает и проверяет main (zlib, строгий валидатор), renderer получает только
// результат. Действий в игре нет и не будет.

import type {
  AdvisorFarmResult,
  AdvisorImportMode,
  AdvisorImportPreview,
  AdvisorImportResult,
  AdvisorItemKind,
  AdvisorMapEstimate,
  AdvisorSaveResult,
  AdvisorShareInfo,
  AdvisorState,
  AdvisorSubmitResult
} from '../types/advisor'

export const advisorChannels = {
  advisor: {
    state: 'advisor:state',
    refresh: 'advisor:refresh',
    startFarm: 'advisor:startFarm',
    decode: 'advisor:decode',
    import: 'advisor:import',
    save: 'advisor:save',
    remove: 'advisor:remove',
    share: 'advisor:share',
    submit: 'advisor:submit',
    setNick: 'advisor:setNick',
    getDraft: 'advisor:getDraft',
    setDraft: 'advisor:setDraft',
    estimate: 'advisor:estimate',
    searchItems: 'advisor:searchItems',
    takeLink: 'advisor:takeLink'
  }
} as const

export const advisorEvents = {
  advisorState: 'event:advisor.state',
  /** «Открыть в POETH» на сайте: код из ссылки poeth-strategy:// — открыть окно импорта (без автодобавления) */
  advisorLink: 'event:advisor.link'
} as const

/** Подсказка поиска предмета в редакторе: ref — английское имя, цена штуки по живым ценам. */
export interface AdvisorItemHit {
  ref: string
  ru?: string
  kind: AdvisorItemKind
  /** chaos за штуку; null — нет на бирже */
  unit: number | null
  low?: boolean
}

export interface AdvisorIpcApi {
  advisor: {
    /** флаг разработки POETH_ADVISOR=1 (preload): вкладка видна, даже если features.advisor = false */
    devFlag: boolean
    state(): Promise<AdvisorState>
    /** перечитать strategies.json, каталог, свои стратегии и цены */
    refresh(): Promise<AdvisorState>
    /** «Начать сессию фарма с этой стратегией»: новая сессия или метка на идущую */
    startFarm(strategyId: string): Promise<AdvisorFarmResult>
    /** код или ссылка → предпросмотр импорта (ничего не добавляет) */
    decode(text: string): Promise<AdvisorImportPreview>
    /** добавить по коду (код раскрывается заново) */
    import(code: string, mode: AdvisorImportMode): Promise<AdvisorImportResult>
    /** сохранить свою из редактора (строгая проверка); id — заменить свою с этим id */
    save(strategy: unknown, id: string | null): Promise<AdvisorSaveResult>
    /** удалить свою (mine / imported) */
    remove(id: string): Promise<boolean>
    /** код и ссылка стратегии из списка (у своей — с ником) */
    share(id: string): Promise<AdvisorShareInfo | null>
    /** «Отправить в каталог»: форма GitHub в браузере (адрес собирает main) */
    submit(id: string): Promise<AdvisorSubmitResult>
    /** ник для «Поделиться»: очищенный (до 40 символов, простой текст) */
    setNick(nick: string): Promise<string>
    /** черновик редактора (сохраняется сам) */
    getDraft(): Promise<unknown | null>
    setDraft(draft: unknown | null): Promise<void>
    /** оценка строк черновика по живым ценам; null — строки не прошли проверку */
    estimate(lines: { inputs: unknown; outputs: unknown }): Promise<AdvisorMapEstimate | null>
    /** поиск предмета по русскому или английскому имени */
    searchItems(query: string): Promise<AdvisorItemHit[]>
    /** код из ссылки «Открыть в POETH», пришедший до открытия вкладки (забрать один раз) */
    takeLink(): Promise<string | null>
  }
  onAdvisorState(cb: (s: AdvisorState) => void): () => void
  onAdvisorLink(cb: (code: string) => void): () => void
}
