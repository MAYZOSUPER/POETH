import type { IpcDomain } from './types'

// Домен «менеджер сделок» (main) — заполняет этап S8.
// TODO S8: whisper-парсер по Client.txt PoE1, карточки сделок, подсветка стэша.

function register(): void {
  // ipcMain.handle(IPC.<домен>.<метод>, …)
}

export const dealsDomain: IpcDomain = { register }
