import type { IpcDomain } from './types'

// Домен «вход в аккаунт» (main) — заполняет этап S3.
// TODO S3: auth.status/login/logout, изолированная сессия persist:poe-account, событие смены статуса.

function register(): void {
  // ipcMain.handle(IPC.<домен>.<метод>, …)
}

export const authDomain: IpcDomain = { register }
