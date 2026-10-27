// Портировано из Awakened PoE Trade (https://github.com/SnosMe/awakened-poe-trade),
// main/src/shortcuts/Shortcuts.ts (отпускание клавиш хоткея, pressKeysToCopyItemText)
// и main/src/shortcuts/text-box.ts (typeInChat, stashSearch), коммит 3188208957.
// MIT License, Copyright (c) SnosMe and contributors. Изменения POETH: акселераторы
// Electron вместо формата APT, ленивая загрузка uiohook (без него — no-op, а не падение),
// проверка «фокус у игры» перед вводом, результат действия вместо void.
//
// Ввод в игру. Правило GGG: одно действие в игре на одно нажатие/клик пользователя —
// никаких таймеров и повторов; троттлинг restoreShortly дополнительно защищает от
// «Too many actions». Публичное API для этапов: captureItemText (S4, PoE2-прайс-чек),
// typeInChat (S6, S8), stashSearch (S7, S8).

import { app } from 'electron'
import type { GameInputResult, ItemLang, OverlayPoint } from '@shared/types'
import { parseAccelerator } from '@shared/accelerators'
import { hostClipboard } from './hostClipboard'
import { detectItemLang } from './itemText'
import { saveCapture } from './captureLog'
import { isFocusTracking, isGameFocused } from '../focus/gameFocus'
import { ensureGameForeground } from '../windows/gameOverlay'

type UiohookLib = typeof import('uiohook-napi')
type KeyTable = UiohookLib['UiohookKey']

let hookLib: UiohookLib | null | undefined

/** uiohook-napi грузится при первом использовании; нет модуля — ввод в игру недоступен. */
function loadHook(): UiohookLib | null {
  if (hookLib !== undefined) return hookLib
  try {
    hookLib = require('uiohook-napi') as UiohookLib
  } catch (e) {
    console.error('[input] uiohook-napi failed to load — in-game input disabled:', e)
    hookLib = null
  }
  return hookLib
}

export function isGameInputAvailable(): boolean {
  return loadHook() !== null
}

// ---------------------------------------------------------------------------
// Глобальный хук мыши — только пока он кому-то нужен
// ---------------------------------------------------------------------------

type MouseDownListener = (screenPhysical: OverlayPoint) => void

const mouseListeners = new Set<MouseDownListener>()
let hookRunning = false

function handleHookMouseDown(e: { x: number; y: number }): void {
  for (const cb of [...mouseListeners]) {
    try {
      cb({ x: e.x, y: e.y })
    } catch (err) {
      console.error('[input] mousedown listener failed:', err)
    }
  }
}

function stopHook(): void {
  if (!hookRunning || !hookLib) return
  hookLib.uIOhook.removeListener('mousedown', handleHookMouseDown)
  hookLib.uIOhook.stop()
  hookRunning = false
}

/**
 * Нажатие мыши в любом месте экрана (физические пиксели). Глобальный хук uiohook
 * запускается с первым подписчиком и останавливается с последним — пока открыто окно
 * Ctrl+D (клик мимо него закрывает окно, как в макете и в APT). В игру мы ничего не шлём.
 */
export function onGlobalMouseDown(cb: MouseDownListener): () => void {
  const k = loadHook()
  if (!k) return () => undefined
  mouseListeners.add(cb)
  if (!hookRunning) {
    k.uIOhook.on('mousedown', handleHookMouseDown)
    k.uIOhook.start()
    hookRunning = true
  }
  return () => {
    mouseListeners.delete(cb)
    if (mouseListeners.size === 0) stopHook()
  }
}

app.on('will-quit', stopHook)

const PUNCT_KEYS: Record<string, keyof KeyTable> = {
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '\\': 'Backslash',
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  Plus: 'Equal'
}

const NAMED_KEYS: Record<string, keyof KeyTable> = {
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  Super: 'Meta',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Enter: 'Enter',
  Escape: 'Escape',
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  CapsLock: 'CapsLock',
  NumLock: 'NumLock',
  ScrollLock: 'ScrollLock',
  PrintScreen: 'PrintScreen'
}

/** Клавиша акселератора Electron → keycode uiohook (undefined — не поддержана). */
function toKeycode(name: string, K: KeyTable): number | undefined {
  const table = K as unknown as Record<string, number>
  if (name in NAMED_KEYS) return table[NAMED_KEYS[name]]
  if (name in PUNCT_KEYS) return table[PUNCT_KEYS[name]]
  const num = /^num([0-9])$/.exec(name)
  if (num) return table[`Numpad${num[1]}`]
  return table[name] // A–Z, 0–9, F1–F24
}

/**
 * «Отпустить» клавиши нажатого хоткея (основная клавиша, затем модификаторы),
 * иначе зажатый игроком Ctrl/Shift смешается с нашими Ctrl+C / Enter.
 * Как APT (Shortcuts.register, без keepModKeys).
 */
export function releaseAcceleratorKeys(accel: string): void {
  const k = loadHook()
  const p = parseAccelerator(accel)
  if (!k || !p) return
  for (const name of [...p.mods, p.key].reverse()) {
    const code = toKeycode(name, k.UiohookKey)
    if (code !== undefined) k.uIOhook.keyToggle(code, 'up')
  }
}

function pressCopyKeys(k: UiohookLib): void {
  // 3.29: Copying an item's text now always copies the advanced description format.
  // (APT: mergeTwoHotkeys('Ctrl + C', showModsKey='Ctrl') → Ctrl down, tap C, Ctrl up)
  const K = k.UiohookKey
  k.uIOhook.keyToggle(K.Ctrl, 'down')
  k.uIOhook.keyTap(K.C)
  k.uIOhook.keyToggle(K.Ctrl, 'up')
}

export interface ItemTextCapture {
  text: string
  lang: ItemLang
}

/**
 * Скопировать предмет под курсором: Ctrl+C в игру → дождаться текста в буфере →
 * восстановить прежний буфер. null — нет игры в фокусе, курсор не над предметом
 * (таймаут ~500 мс) или язык клиента не en/ru.
 * Вызывать из обработчика хоткея области 'game' (клавиши хоткея уже отпущены — hotkeys.ts).
 */
export async function captureItemText(): Promise<ItemTextCapture | null> {
  const k = loadHook()
  if (!k) return null
  // фокус отслеживается, а игра не в фокусе — Ctrl+C ушёл бы в чужое окно
  if (isFocusTracking() && !isGameFocused()) return null

  const reading = hostClipboard.readItemText() // снимок + очистка буфера — синхронно
  pressCopyKeys(k)
  const text = await reading
  if (!text) return null

  const lang = detectItemLang(text)
  if (!lang) {
    console.warn('[input] item copied, but the game client language is not en/ru — ignored')
    return null
  }
  void saveCapture(text, lang)
  return { text, lang }
}

// ---------------------------------------------------------------------------
// Чат и поиск в стэше (порт text-box.ts)
// ---------------------------------------------------------------------------

const PLACEHOLDER_LAST = '@last'
const AUTO_CLEAR = [
  '#', // Global
  '%', // Party
  '@', // Whisper
  '$', // Trade
  '&', // Guild
  '/' // Command
]

function prepareInput(): UiohookLib | GameInputResult {
  const k = loadHook()
  if (!k) return 'no-input'
  if (!ensureGameForeground()) return 'no-game'
  return k
}

/**
 * Вставить текст в чат игры через буфер обмена (буфер вернётся через 120 мс).
 * `@last <текст>` — ответить последнему, `<текст> @last` — дописать к последнему
 * собеседнику (как APT). send — сразу отправить (Enter) и вернуть прежний канал чата.
 */
export function typeInChat(text: string, opts: { send?: boolean } = {}): GameInputResult {
  const k = prepareInput()
  if (typeof k === 'string') return k
  const { uIOhook, UiohookKey: Key } = k
  const send = !!opts.send

  const done = hostClipboard.restoreShortly((clipboard) => {
    const modifiers = process.platform === 'darwin' ? [Key.Meta] : [Key.Ctrl]

    if (text.startsWith(PLACEHOLDER_LAST)) {
      text = text.slice(`${PLACEHOLDER_LAST} `.length)
      clipboard.writeText(text)
      uIOhook.keyTap(Key.Enter, modifiers)
    } else if (text.endsWith(PLACEHOLDER_LAST)) {
      text = text.slice(0, -PLACEHOLDER_LAST.length)
      clipboard.writeText(text)
      uIOhook.keyTap(Key.Enter, modifiers)
      uIOhook.keyTap(Key.Home)
      // press twice to focus input when using controller
      uIOhook.keyTap(Key.Home)
      uIOhook.keyTap(Key.Delete)
    } else {
      clipboard.writeText(text)
      uIOhook.keyTap(Key.Enter)
      if (!AUTO_CLEAR.includes(text[0])) {
        uIOhook.keyTap(Key.A, modifiers)
      }
    }

    uIOhook.keyTap(Key.V, modifiers)

    if (send) {
      uIOhook.keyTap(Key.Enter)
      // restore the last chat
      uIOhook.keyTap(Key.Enter)
      uIOhook.keyTap(Key.ArrowUp)
      uIOhook.keyTap(Key.ArrowUp)
      uIOhook.keyTap(Key.Escape)
    }
  })
  return done ? 'ok' : 'busy'
}

/** Поиск в стэше/у торговца: Ctrl+F → вставить текст → Enter (буфер вернётся через 120 мс). */
export function stashSearch(text: string): GameInputResult {
  const k = prepareInput()
  if (typeof k === 'string') return k
  const { uIOhook, UiohookKey: Key } = k

  const done = hostClipboard.restoreShortly((clipboard) => {
    clipboard.writeText(text)
    uIOhook.keyTap(Key.F, [Key.Ctrl])
    uIOhook.keyTap(Key.V, [process.platform === 'darwin' ? Key.Meta : Key.Ctrl])
    uIOhook.keyTap(Key.Enter)
  })
  return done ? 'ok' : 'busy'
}
