// IPC домена «трекер карт и сессия фарма» (этап S11b): состояние, кнопки сессии, настройки
// виджета, история забегов, проверка строк лога. API для учёта богатства (S11a) — в main, без
// IPC: src/main/services/farmSession.ts (onFarmEvent / getFarmState / setRunProfit).
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type { FarmConfigPatch, FarmLogStatus, FarmState } from '../types/farm'

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
    simulate: 'farm:simulate',
    logStatus: 'farm:logStatus'
  }
} as const

export const farmEvents = {
  /** состояние изменилось (вход в зону, смерть, кнопки, прибыль от S11a) */
  farmChanged: 'event:farm.changed',
  farmLog: 'event:farm.log'
} as const

export interface FarmIpcApi {
  farm: {
    state(): Promise<FarmState>
    /** «Начать» сессию фарма */
    start(): Promise<FarmState>
    pause(): Promise<FarmState>
    /** «Продолжить» после паузы */
    resume(): Promise<FarmState>
    /** «Стоп»: закрыть открытый забег и сессию */
    stop(): Promise<FarmState>
    setConfig(patch: FarmConfigPatch): Promise<FarmState>
    removeRun(id: string): Promise<FarmState>
    /** очистить историю забегов и сессий */
    clear(): Promise<FarmState>
    /** прогнать строки Client.txt через трекер (проверка, тесты) */
    simulate(lines: string[]): Promise<FarmState>
    logStatus(): Promise<FarmLogStatus>
  }
  onFarmChanged(cb: (state: FarmState) => void): () => void
  onFarmLog(cb: (status: FarmLogStatus) => void): () => void
}
