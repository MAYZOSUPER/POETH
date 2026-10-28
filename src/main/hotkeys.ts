import { globalShortcut } from 'electron'
import { IPC } from '@shared/ipc'
import type { HotkeyAction, HotkeyMap } from '@shared/types'
import { sendToCompanion } from './windows/companionWindow'
import { sendToOverlay, setOverlayPriceCheckAccel, setOverlayToggleAccel } from './windows/gameOverlay'
import { isGameFocused, onGameFocusChange } from './focus/gameFocus'
import {
  planHotkeys,
  type ExtraHotkey,
  type HotkeyId,
  type HotkeyPlan,
  type PlannedHotkey
} from './input/hotkeyPlan'
import { releaseAcceleratorKeys } from './input/gameInput'

// Глобальные хоткеи v2. Домены регистрируют main-обработчики своих действий через
// onHotkeyAction() в setupForGame() (см. src/main/ipc/*). Каждое срабатывание
// после обработчика пересылается в renderer компаньона и оверлея (event:hotkey).
//
// Регистрируются ТОЛЬКО действия, у которых есть обработчик для текущей игры —
// иначе мы впустую перехватывали бы системные сочетания (Shift+Space, Ctrl+Shift+T…).
// Область (S1): 'always' — регистрируется сразу; 'game' — только пока окно игры
// в фокусе (focus/blur OverlayController → focus/gameFocus.ts), как в APT: Ctrl+D и
// Shift+Space не отнимаются у браузера/других программ. Пока активен сам оверлей,
// Shift+Space и Esc ловит его окно (before-input-event, windows/gameOverlay.ts).
// Зарезервированные игрой/системой сочетания (Ctrl+C/V/F/A, Enter, стрелки…) не
// регистрируются — их нельзя и сохранить в настройках (isReservedAccelerator).

export { isReservedAccelerator, reservedReason, type ReservedReason } from '@shared/accelerators'

export type { HotkeyId, ExtraHotkey }

export interface HotkeyContext {
  action: HotkeyId
  /** каноническая запись нажатого сочетания */
  accel: string
}

type Handler = (ctx: HotkeyContext) => void | Promise<void>

const handlers = new Map<HotkeyId, Handler>()
/** хоткеи вне HotkeyMap — команды чата (src/main/input/chatCommands.ts) */
let extras: ExtraHotkey[] = []
let currentMap: HotkeyMap | null = null

let plan: HotkeyPlan = { game: [], always: [], skipped: [] }
/** registerHotkeys вызван и не приостановлен (suspend на время записи нового сочетания) */
let enabled = false
let gameRegistered = false

/** Назначить main-обработчик действия (заменяет прежний). */
export function onHotkeyAction(action: HotkeyId, handler: Handler): void {
  handlers.set(action, handler)
}

/** Есть ли уже обработчик (домены не перебивают друг друга, см. ipc/overlay.ts). */
export function hasHotkeyAction(action: HotkeyId): boolean {
  return handlers.has(action)
}

/** Сбросить обработчики (перед повторной настройкой доменов под игру); prefix — только свои ('chat:'). */
export function clearHotkeyActions(prefix?: string): void {
  if (!prefix) {
    handlers.clear()
    return
  }
  for (const id of [...handlers.keys()]) if (id.startsWith(prefix)) handlers.delete(id)
}

/**
 * Хоткеи вне HotkeyMap (команды чата). Сразу перерегистрирует всё, если хоткеи активны;
 * во время записи нового сочетания (suspend) — применится на resume.
 */
export function setExtraHotkeys(list: ExtraHotkey[]): void {
  extras = list.map((e) => ({ ...e }))
  if (enabled && currentMap) registerHotkeys(currentMap)
}

/** Выполнить действие хоткея: main-обработчик, затем уведомить renderer'ы. */
export async function dispatchHotkey(action: HotkeyId, accel = ''): Promise<void> {
  try {
    await handlers.get(action)?.({ action, accel })
  } catch (e) {
    console.error(`[hotkeys] action ${action} failed:`, e)
  }
  // renderer'ам — только обычные действия (команды чата им не нужны)
  if (action.startsWith('chat:')) return
  sendToCompanion(IPC.events.hotkey, action as HotkeyAction)
  sendToOverlay(IPC.events.hotkey, action as HotkeyAction)
}

function register(h: PlannedHotkey): void {
  try {
    const ok = globalShortcut.register(h.accel, () => {
      // игрок ещё держит клавиши хоткея — «отпустить» их до нашего ввода в игру (Ctrl+C…)
      if (h.scope === 'game') releaseAcceleratorKeys(h.accel)
      void dispatchHotkey(h.action, h.accel)
    })
    if (!ok) console.warn(`[hotkeys] "${h.accel}" (${h.action}) is taken by another application`)
  } catch (e) {
    console.warn(`[hotkeys] cannot register "${h.accel}" (${h.action}):`, e)
  }
}

/** Привести регистрацию хоткеев области 'game' к текущему фокусу игры. */
function syncGameHotkeys(): void {
  const want = enabled && isGameFocused()
  if (want === gameRegistered) return
  gameRegistered = want
  for (const h of plan.game) {
    if (want) register(h)
    else globalShortcut.unregister(h.accel)
  }
}

export function registerHotkeys(map: HotkeyMap): void {
  globalShortcut.unregisterAll()
  enabled = true
  gameRegistered = false
  currentMap = map
  plan = planHotkeys(map, (a) => handlers.has(a), extras)
  for (const s of plan.skipped) {
    console.warn(`[hotkeys] "${s.accel}" (${s.action}) not registered: ${s.reason}`)
  }
  setOverlayToggleAccel(plan.game.find((h) => h.action === 'overlayToggle')?.accel ?? '')
  setOverlayPriceCheckAccel(plan.game.find((h) => h.action === 'priceCheck')?.accel ?? '')
  for (const h of plan.always) register(h)
  syncGameHotkeys()
}

export function unregisterHotkeys(): void {
  enabled = false
  gameRegistered = false
  globalShortcut.unregisterAll()
}

/** Что сейчас зарегистрировано и что пропущено (диагностика). */
export function getHotkeyPlan(): HotkeyPlan & { gameRegistered: boolean } {
  return { ...plan, gameRegistered }
}

// focus/blur игры: как в APT — отложить до следующего тика и взять состояние на тот
// момент (быстрые переключения Alt+Tab не дёргают регистрацию дважды).
onGameFocusChange(() => process.nextTick(syncGameHotkeys))
