import { clipboard, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { ItemEnRequest, OverlayNotice } from '@shared/types'
import { onHotkeyAction } from '../hotkeys'
import { getOverlayWindow, sendToOverlay } from '../windows/gameOverlay'
import { captureItemText } from '../input/gameInput'

// «Скопировать предмет по-английски» (S51, PoE 1; часть домена overlay — зовут его register/setupForGame): хоткей
// copyItemEn (область «игра в фокусе», по умолчанию без клавиши). Одно нажатие — одно Ctrl+C, как у Ctrl+D
// (captureItemText: снимок буфера, копирование, возврат буфера).
// Английский текст собирает оверлей (там загружены данные PoE1: @shared/build/itemEnCopy) и отдаёт сюда — main
// кладёт его в буфер и прежний буфер уже не возвращает: игрок для того и нажал клавишу. Уведомление поверх игры —
// у оверлея. Текст предмета живёт только в памяти: на диск и в сеть не уходит.

/** Текст предмета для PoB — до 16 КБ (pobItemEn); с запасом под CRLF EN-клиента. */
const COPY_MAX = 32 * 1024

function fromOverlay(e: Electron.IpcMainInvokeEvent): boolean {
  const w = getOverlayWindow()
  return !!w && e.sender === w.webContents
}

/** Канал записи в буфер (один раз, при старте). */
export function registerCopyItemEn(): void {
  ipcMain.handle(IPC.overlay.copyItemEn, (e, text: unknown) => {
    if (!fromOverlay(e)) return false
    if (typeof text !== 'string' || !text.trim() || text.length > COPY_MAX) return false
    clipboard.writeText(text)
    return true
  })
}

/** Хоткей — только PoE 1 (у PoE 2 своя пересборка не написана). */
export function setupCopyItemEn(def: GameDef): void {
  if (def.id !== 'poe1') return
  onHotkeyAction('copyItemEn', async () => {
    const item = await captureItemText()
    if (!item) {
      const notice: OverlayNotice = { key: 'overlay.itemEn.noItem', kind: 'warn' }
      sendToOverlay(IPC.events.overlayNotice, notice)
      return
    }
    const req: ItemEnRequest = { text: item.text, lang: item.lang }
    sendToOverlay(IPC.events.overlayItemEn, req)
  })
}
