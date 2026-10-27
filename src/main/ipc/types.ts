import type { GameDef } from '@shared/games'

// Контракт доменного модуля main-IPC (src/main/ipc/<домен>.ts). Список доменов —
// в ipc/index.ts (ЗАМОРОЖЕН после S0); этап меняет только свой доменный файл.
export interface IpcDomain {
  /** ipcMain.handle/on для каналов домена — вызывается один раз при старте. */
  register(): void
  /**
   * Настройка под запущенную игру: обработчики хоткеев (onHotkeyAction),
   * сервисы домена. Вызывается при старте и при мягком перезапуске (dev).
   */
  setupForGame?(def: GameDef): void | Promise<void>
}
