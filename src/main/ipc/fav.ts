import type { IpcDomain } from './types'

// Домен «избранное и трейд-окно» (main) — заполняет этап S5.
// TODO S5: стор избранного, окно tradeWindow (BaseWindow + sidebarView/siteView); хоткей toggleTradeWindow.

function register(): void {
  // ipcMain.handle(IPC.<домен>.<метод>, …)
}

export const favDomain: IpcDomain = { register }
