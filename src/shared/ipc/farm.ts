// IPC домена «трекер карт и сессия фарма» (этап S11b; PoE 2 — S69): состояние, кнопки сессии, настройки
// виджета, история забегов, проверка строк лога, «+ находка» к забегу PoE 2. Окна видят трекер
// запущенной игры. API для учёта богатства (S11a — PoE 1, S70 — PoE 2) — в main, без IPC:
// src/main/services/farmSession.ts (onFarmEvent / getFarmState / setRunProfit / addRunFind / setSessionProfit).
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type {
  FarmConfigPatch,
  FarmFindInput,
  FarmFindResult,
  FarmLogStatus,
  FarmStartOptions,
  FarmState,
  FarmStopOptions
} from '../types/farm'

export const farmChannels = {
  farm: {
    state: 'farm:state',
    start: 'farm:start',
    pause: 'farm:pause',
    resume: 'farm:resume',
    stop: 'farm:stop',
    setConfig: 'farm:setConfig',
    removeRun: 'farm:removeRun',
    clear: 'farm:clear',
    addFind: 'farm:addFind',
    removeFind: 'farm:removeFind',
    simulate: 'farm:simulate',
    logStatus: 'farm:logStatus'
  }
} as const

export const farmEvents = {
  /** состояние изменилось (вход в зону, смерть, кнопки, прибыль от S11a/S70, находки) */
  farmChanged: 'event:farm.changed',
  farmLog: 'event:farm.log'
} as const

export interface FarmIpcApi {
  farm: {
    state(): Promise<FarmState>
    /** «Начать» сессию фарма; PoE 2 — с выбором «Чем отметить начало?» */
    start(opts?: FarmStartOptions): Promise<FarmState>
    pause(): Promise<FarmState>
    /** «Продолжить» после паузы */
    resume(): Promise<FarmState>
    /** «Стоп»: закрыть открытый забег и сессию; PoE 2 — с выбором «Как посчитать прибыль?» */
    stop(opts?: FarmStopOptions): Promise<FarmState>
    setConfig(patch: FarmConfigPatch): Promise<FarmState>
    removeRun(id: string): Promise<FarmState>
    /** очистить историю забегов и сессий */
    clear(): Promise<FarmState>
    /**
     * PoE 2: «+ находка» к забегу — окно цены (Ctrl+D) или ручной ввод. Без runId — открытый забег,
     * иначе последний забег идущей сессии; noRun — игрок ещё не заходил в карту.
     */
    addFind(input: FarmFindInput): Promise<FarmFindResult>
    removeFind(runId: string, findId: string): Promise<FarmState>
    /** прогнать строки Client.txt через трекер (проверка, тесты) */
    simulate(lines: string[]): Promise<FarmState>
    logStatus(): Promise<FarmLogStatus>
  }
  onFarmChanged(cb: (state: FarmState) => void): () => void
  onFarmLog(cb: (status: FarmLogStatus) => void): () => void
}
