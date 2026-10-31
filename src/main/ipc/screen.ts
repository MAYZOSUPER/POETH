import { ipcMain } from 'electron'
import type { GameDef } from '@shared/games'
import { screenChannels } from '@shared/ipc/screen'
import { HOTKEY_ACTIONS } from '@shared/settings'
import type { HotkeyAction } from '@shared/types/settings'
import { onHotkeyAction } from '../hotkeys'
import { getScreenState, hideScreenLabels, onScreenHotkey } from '../screen/service'
import type { IpcDomain } from './types'

// Домен «цены поверх окон» (S68): src/main/screen/*. Каналы — только чтение состояния и «спрятать»; снимок экрана —
// только по хоткею игрока (здесь), каналов «сними экран» нет. Звать каналы может только игровой оверлей
// (OVERLAY_CHANNELS — строка через лида, S68-frozen.diff).

/** Действие хоткея; строка в HotkeyAction и HOTKEY_DEFAULTS — через лида. До неё хоткей просто не регистрируется. */
const ACTION = 'screenPrices'

function register(): void {
  ipcMain.handle(screenChannels.screen.state, () => getScreenState())
  ipcMain.handle(screenChannels.screen.hide, () => hideScreenLabels())
}

function setupForGame(def: GameDef): void {
  hideScreenLabels()
  if (!(HOTKEY_ACTIONS as readonly string[]).includes(ACTION)) return
  // keepKeys: хоткей ничего не вводит в игру — клавиши игрока не «отпускаем» (Alt держит подсказки игры)
  onHotkeyAction(ACTION as HotkeyAction, () => void onScreenHotkey(def), { keepKeys: true })
}

export const screenDomain: IpcDomain = { register, setupForGame }
