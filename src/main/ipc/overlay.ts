import type { IpcDomain } from './types'

// Домен «игровой оверлей» (main) — заполняет этап S1.
// TODO S1: окно gameOverlay (attach к окну игры), Shift+Space/Esc, Ctrl+D → копия предмета → восстановление буфера; хоткеи overlayToggle/priceCheck(poe1) через onHotkeyAction в setupForGame.

function register(): void {
  // ipcMain.handle(IPC.<домен>.<метод>, …)
}

export const overlayDomain: IpcDomain = { register }
