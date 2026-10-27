import type { IpcDomain } from './types'

// Домен «live search» (main) — заполняет этап S6.
// TODO S6: менеджер live-поисков (ws через сессию аккаунта), уведомления; хоткей whisperLastHit.

function register(): void {
  // ipcMain.handle(IPC.<домен>.<метод>, …)
}

export const liveDomain: IpcDomain = { register }
