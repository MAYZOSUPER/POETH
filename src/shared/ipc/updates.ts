// IPC домена «запуск и обновления» (S10a): экран загрузки, окно «Вышло обновление»,
// проверка обновлений из настроек и трея.
// Соглашение: каналы '<домен>:<метод>', события 'event:<домен>.<имя>' (tests/ipc.test.ts).

import type { StartupState, UpdateState } from '../types/updates'

export const updatesChannels = {
  updates: {
    state: 'updates:state',
    check: 'updates:check',
    install: 'updates:install',
    later: 'updates:later'
  },
  startup: {
    state: 'startup:state'
  }
} as const

export const updatesEvents = {
  updateState: 'event:updates.state',
  startupState: 'event:startup.state'
} as const

export interface UpdatesIpcApi {
  updates: {
    /** текущее состояние автообновления приложения */
    state(): Promise<UpdateState>
    /** проверить сейчас (кнопка в настройках/трее); ошибки сети — в состоянии, без окон */
    check(): Promise<UpdateState>
    /** «Обновить сейчас»: скачать с прогрессом, затем перезапуск с установкой */
    install(): void
    /** «Позже»: закрыть окно, этой версии не предлагать до следующего запуска */
    later(): void
  }
  startup: {
    state(): Promise<StartupState>
  }
  onUpdateState(cb: (state: UpdateState) => void): () => void
  onStartupState(cb: (state: StartupState) => void): () => void
}
