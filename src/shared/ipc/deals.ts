// IPC домена «менеджер сделок» (этап S8): история, настройки менеджера, экспорт, чёрный список
// PoE Hub, примеры; фаза 2 — кнопки карточек поверх игры (одна команда в чат на нажатие),
// закрытие карточки, калибровка стэша кликами поверх игры, выбор Client.txt PoE1.
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type {
  BlacklistHit,
  BlacklistStatus,
  Deal,
  DealActionResult,
  DealCardAction,
  DealLang,
  DealsCalibrateResult,
  DealStatus,
  DealsConfigPatch,
  DealsExportResult,
  DealsLogStatus,
  DealsState
} from '../types/deals'

export const dealsChannels = {
  deals: {
    state: 'deals:state',
    setStatus: 'deals:setStatus',
    remove: 'deals:remove',
    clear: 'deals:clear',
    setConfig: 'deals:setConfig',
    export: 'deals:export',
    demo: 'deals:demo',
    simulate: 'deals:simulate',
    logStatus: 'deals:logStatus',
    pickLog: 'deals:pickLog',
    action: 'deals:action',
    hideCard: 'deals:hideCard',
    calibrate: 'deals:calibrate',
    blacklist: {
      status: 'deals:blacklist.status',
      refresh: 'deals:blacklist.refresh',
      check: 'deals:blacklist.check'
    }
  }
} as const

export const dealsEvents = {
  dealsChanged: 'event:deals.changed',
  dealsNew: 'event:deals.new',
  dealsBlacklist: 'event:deals.blacklist',
  dealsLog: 'event:deals.log',
  /** main → оверлей: начать калибровку стэша кликами (оверлей уже активирован) */
  dealsCalibrate: 'event:deals.calibrate'
} as const

export interface DealsIpcApi {
  deals: {
    state(): Promise<DealsState>
    setStatus(id: string, status: DealStatus): Promise<DealsState>
    remove(id: string): Promise<DealsState>
    /** очистить историю; demoOnly — убрать только примеры */
    clear(demoOnly?: boolean): Promise<DealsState>
    setConfig(patch: DealsConfigPatch): Promise<DealsState>
    /** сохранить историю в файл (JSON или CSV — по выбору в диалоге) */
    export(): Promise<DealsExportResult>
    /** добавить примеры сделок (язык сообщений) */
    demo(lang: DealLang): Promise<DealsState>
    /** прогнать строки Client.txt через разбор (проверка строки, тесты); возвращает новые сделки */
    simulate(lines: string[]): Promise<Deal[]>
    logStatus(): Promise<DealsLogStatus>
    /** выбрать Client.txt PoE1 вручную (диалог); null — сбросить на автопоиск */
    pickLog(reset?: boolean): Promise<DealsLogStatus>
    /** кнопка карточки: одна команда в чат игры, затем смена статуса */
    action(id: string, action: DealCardAction): Promise<DealActionResult>
    /** закрыть карточку поверх игры (hidden=false — вернуть) */
    hideCard(id: string, hidden?: boolean): Promise<DealsState>
    /** калибровка стэша: активировать оверлей и ждать двух кликов по углам сетки */
    calibrate(): Promise<DealsCalibrateResult>
    blacklist: {
      status(): Promise<BlacklistStatus>
      refresh(): Promise<BlacklistStatus>
      /** проверить имя (аккаунт или персонаж) по чёрному списку */
      check(name: string): Promise<BlacklistHit | null>
    }
  }
  onDealsChanged(cb: (state: DealsState) => void): () => void
  onDealsNew(cb: (deal: Deal) => void): () => void
  onDealsBlacklist(cb: (status: BlacklistStatus) => void): () => void
  onDealsLog(cb: (status: DealsLogStatus) => void): () => void
  onDealsCalibrate(cb: () => void): () => void
}
