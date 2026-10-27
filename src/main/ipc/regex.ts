import type { IpcDomain } from './types'

// Домен «regex-строки» (main) — заполняет этап S7.
// TODO S7: движок/библиотека строк; хоткеи pasteSearch1..5 (вставка в поле поиска игры).

function register(): void {
  // ipcMain.handle(IPC.<домен>.<метод>, …)
}

export const regexDomain: IpcDomain = { register }
