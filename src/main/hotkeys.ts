import { globalShortcut } from 'electron'
import { IPC } from '@shared/ipc'
import type { HotkeyAction, HotkeyMap } from '@shared/types'
import { sendToCompanion } from './windows/companionWindow'

// Глобальные хоткеи v2. Домены регистрируют main-обработчики своих действий через
// onHotkeyAction() в setupForGame() (см. src/main/ipc/*). Каждое срабатывание
// после обработчика пересылается в renderer компаньона (event:hotkey).
//
// Регистрируются ТОЛЬКО действия, у которых есть обработчик для текущей игры —
// иначе мы впустую перехватывали бы системные сочетания (Shift+Space, Ctrl+Shift+T…).
// TODO S1: scope 'game' — регистрировать только пока окно игры в фокусе
// (focus/blur контроллера оверлея); 'always' — всегда. Пока scope лишь хранится.

type Handler = () => void | Promise<void>

const handlers = new Map<HotkeyAction, Handler>()

/** Назначить main-обработчик действия (заменяет прежний). */
export function onHotkeyAction(action: HotkeyAction, handler: Handler): void {
  handlers.set(action, handler)
}

/** Сбросить все обработчики (перед повторной настройкой доменов под игру). */
export function clearHotkeyActions(): void {
  handlers.clear()
}

/** Выполнить действие хоткея: main-обработчик, затем уведомить renderer. */
export async function dispatchHotkey(action: HotkeyAction): Promise<void> {
  try {
    await handlers.get(action)?.()
  } catch (e) {
    console.error(`[hotkeys] action ${action} failed:`, e)
  }
  sendToCompanion(IPC.events.hotkey, action)
}

export function registerHotkeys(map: HotkeyMap): void {
  globalShortcut.unregisterAll()
  for (const [action, binding] of Object.entries(map) as [HotkeyAction, HotkeyMap[HotkeyAction]][]) {
    if (!binding.accel || !handlers.has(action)) continue
    try {
      globalShortcut.register(binding.accel, () => void dispatchHotkey(action))
    } catch {
      // ignore invalid / already-taken accelerators
    }
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
