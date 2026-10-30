import { ipcMain, screen } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { CapturedItem, OverlayState } from '@shared/types'
import { getSettings } from '../services/settingsStore'
import { getHotkeyConflicts, hasHotkeyAction, onHotkeyAction, onHotkeyConflicts, onHotkeyConflictWarning } from '../hotkeys'
import { notifyUser } from '../services/notify'
import { showCompanionPage } from './app'
import { getGameFocus } from '../focus/gameFocus'
import { setInteractiveRects, setPollInterval, trackAutoHide } from '../focus/interactiveAreas'
import { captureItemText, stashSearch, typeInChat } from '../input/gameInput'
import {
  activateOverlay,
  displayAreaInOverlay,
  focusGame,
  getOverlayStatus,
  getOverlayWindow,
  initGameOverlay,
  sendToOverlay,
  toOverlayPoint,
  toggleOverlay
} from '../windows/gameOverlay'
import { sendToCompanion } from '../windows/companionWindow'
import type { IpcDomain } from './types'
import { getPasteString } from './regex'
import { setupChatCommands } from '../input/chatCommands'
import { registerCopyItemEn, setupCopyItemEn } from './itemEn'

// Домен «игровой оверлей» (S1): окно поверх игры (windows/gameOverlay.ts), хоткеи
// overlayToggle (Shift+Space) и priceCheck (Ctrl+D → текст предмета), кликабельные
// виджеты (focus/interactiveAreas.ts), ввод в игру для renderer'ов (чат, поиск в стэше),
// хоткеи pasteSearch1..5 → строка слота regex-библиотеки (S7) → поиск в стэше, команды
// чата по хоткеям (input/chatCommands.ts), предмет по-английски в буфер (S51, ipc/itemEn.ts).

type ItemListener = (item: CapturedItem) => void

const itemListeners = new Set<ItemListener>()
let lastItem: CapturedItem | null = null

/**
 * Подписка main-кода на захваченные по Ctrl+D предметы (S4: прайс-чек PoE1).
 * Возвращает отписку. Renderer'ы получают то же событием onItemCaptured.
 */
export function onItemCaptured(cb: ItemListener): () => void {
  itemListeners.add(cb)
  return () => itemListeners.delete(cb)
}

export function getLastCapturedItem(): CapturedItem | null {
  return lastItem
}

/** Ctrl+D: скопировать предмет под курсором и разослать его (оверлей, компаньон, main). */
export async function captureAndPublishItem(): Promise<CapturedItem | null> {
  const screenCursor = screen.getCursorScreenPoint()
  const cursor = toOverlayPoint(screenCursor)
  const area = displayAreaInOverlay(screenCursor)
  const item = await captureItemText()
  if (!item) return null
  const captured: CapturedItem = { ...item, cursor, area, at: Date.now() }
  lastItem = captured
  sendToOverlay(IPC.events.overlayItemCaptured, captured)
  sendToCompanion(IPC.events.overlayItemCaptured, captured)
  for (const cb of [...itemListeners]) {
    try {
      cb(captured)
    } catch (e) {
      console.error('[overlay] item listener failed:', e)
    }
  }
  return captured
}

function fromOverlay(e: Electron.IpcMainEvent): boolean {
  const w = getOverlayWindow()
  return !!w && e.sender === w.webContents
}

function register(): void {
  ipcMain.handle(
    IPC.overlay.getState,
    (): OverlayState => ({ status: getOverlayStatus(), focus: getGameFocus(), lastItem })
  )
  ipcMain.on(IPC.overlay.activate, () => activateOverlay())
  ipcMain.on(IPC.overlay.focusGame, () => focusGame())
  // прямоугольники и авто-скрытие относятся к окну оверлея — от других окон игнорируем
  ipcMain.on(IPC.overlay.updateInteractiveRects, (e, rects: unknown) => {
    if (fromOverlay(e)) setInteractiveRects(rects)
  })
  ipcMain.on(IPC.overlay.trackAutoHide, (e, from: unknown, threshold: unknown) => {
    if (fromOverlay(e)) trackAutoHide(from, threshold)
  })
  // ввод в игру — по клику игрока в нашем окне (одно действие на клик)
  ipcMain.handle(IPC.overlay.typeInChat, (_e, text: unknown, opts: unknown) => {
    if (typeof text !== 'string' || !text) return 'no-input'
    const send = typeof opts === 'object' && opts !== null && (opts as { send?: unknown }).send === true
    return typeInChat(text, { send })
  })
  ipcMain.handle(IPC.overlay.stashSearch, (_e, text: unknown) => {
    if (typeof text !== 'string' || !text) return 'no-input'
    return stashSearch(text)
  })
  registerCopyItemEn()

  // Хоткей занят другой программой (APT, Sidekick…): плашка в настройках и раз за сессию —
  // предупреждение поверх игры (или уведомлением Windows) с кнопкой «Сменить клавишу».
  ipcMain.handle(IPC.overlay.hotkeyConflicts, () => getHotkeyConflicts())
  ipcMain.on(IPC.overlay.openHotkeySettings, () => {
    focusGame()
    showCompanionPage('settings')
  })
  onHotkeyConflicts((list) => {
    sendToCompanion(IPC.events.overlayHotkeyConflicts, list)
    sendToOverlay(IPC.events.overlayHotkeyConflicts, list)
  })
  onHotkeyConflictWarning((c) => {
    void notifyUser('hotkeyTaken', { key: c.accel.replace(/Control/g, 'Ctrl') }, 'warn', 'hotkeySettings')
  })
}

async function setupForGame(def: GameDef): Promise<void> {
  initGameOverlay(def)
  setPollInterval((await getSettings()).clickThroughPollMs)
  onHotkeyAction('overlayToggle', () => toggleOverlay(true))
  // Команды чата по хоткеям (F5 → /hideout…), Settings.chatCommands
  await setupChatCommands(def)
  setupCopyItemEn(def)
  // Строки regex из библиотеки S7 по хоткеям: одно нажатие = Ctrl+F + вставка (без Enter).
  if (def.features.regex) {
    for (const slot of [1, 2, 3, 4, 5] as const) {
      onHotkeyAction(`pasteSearch${slot}`, async () => {
        const text = await getPasteString(slot)
        if (text) stashSearch(text, { submit: false })
      })
    }
  }
  // Ctrl+D: если priceCheck уже взял другой домен (PoE2 — trade.ts; ipc/index.ts
  // настраивает trade раньше overlay), не перебиваем его — тот вызывает captureItemText сам.
  if (!hasHotkeyAction('priceCheck')) {
    onHotkeyAction('priceCheck', async () => {
      await captureAndPublishItem()
    })
  }
}

export const overlayDomain: IpcDomain = { register, setupForGame }
