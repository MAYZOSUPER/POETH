// Портировано из Awakened PoE Trade (https://github.com/SnosMe/awakened-poe-trade),
// main/src/shortcuts/Shortcuts.ts (отпускание клавиш хоткея, pressKeysToCopyItemText)
// и main/src/shortcuts/text-box.ts (typeInChat, stashSearch), коммит 3188208957.
// MIT License, Copyright (c) SnosMe and contributors. Изменения POETH: акселераторы
// Electron вместо формата APT, ленивая загрузка uiohook (без него — no-op, а не падение),
// проверка «фокус у игры» перед вводом, результат действия вместо void; ввод — одна строка, без разбора
// «@last» (S29).
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
import { toGameLine } from './chatLine'
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
// Глобальный хук мыши и клавиатуры — только пока он кому-то нужен. Только слушаем: в игру отсюда
// ничего не уходит. Подписчики: окно Ctrl+D (клик мимо закрывает окно), наложение дерева билда (S38:
// панорама вслед за мышью, калибровка средней кнопкой, Esc закрывает).
// ---------------------------------------------------------------------------

/** Кнопка мыши uiohook: 1 — левая, 2 — правая, 3 — средняя. */
export type GlobalMouseButton = number

type MouseListener = (screenPhysical: OverlayPoint, button: GlobalMouseButton) => void
/** rotation > 0 — колесо к себе, < 0 — от себя */
type WheelListener = (screenPhysical: OverlayPoint, rotation: number) => void

export interface GlobalKey {
  /** keycode uiohook (UiohookKey) */
  keycode: number
  alt: boolean
  ctrl: boolean
  shift: boolean
  meta: boolean
}

type KeyListener = (key: GlobalKey) => void

type HookMouse = import('uiohook-napi').UiohookMouseEvent
type HookWheel = import('uiohook-napi').UiohookWheelEvent
type HookKey = import('uiohook-napi').UiohookKeyboardEvent

function emit<A extends unknown[]>(name: string, set: ReadonlySet<(...a: A) => void>, ...args: A): void {
  for (const cb of [...set]) {
    try {
      cb(...args)
    } catch (err) {
      console.error(`[input] ${name} listener failed:`, err)
    }
  }
}

const mouseDown = new Set<MouseListener>()
const mouseUp = new Set<MouseListener>()
const mouseMove = new Set<MouseListener>()
const wheel = new Set<WheelListener>()
const keyDown = new Set<KeyListener>()

const point = (e: { x: number; y: number }): OverlayPoint => ({ x: e.x, y: e.y })

// обработчик события uiohook висит, только пока у него есть подписчики: движение мыши — сотни событий в секунду
const HOOK_EVENTS = [
  { event: 'mousedown', set: mouseDown, fn: (e: HookMouse) => emit('mousedown', mouseDown, point(e), Number(e.button)) },
  { event: 'mouseup', set: mouseUp, fn: (e: HookMouse) => emit('mouseup', mouseUp, point(e), Number(e.button)) },
  { event: 'mousemove', set: mouseMove, fn: (e: HookMouse) => emit('mousemove', mouseMove, point(e), Number(e.button)) },
  { event: 'wheel', set: wheel, fn: (e: HookWheel) => emit('wheel', wheel, point(e), e.rotation) },
  {
    event: 'keydown',
    set: keyDown,
    fn: (e: HookKey) =>
      emit('keydown', keyDown, { keycode: e.keycode, alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey })
  }
] as const

let hookRunning = false
const attached = new Set<string>()

type AnyHookListener = (e: never) => void

function syncHook(): void {
  const k = hookLib
  if (!k) return
  const hook = k.uIOhook as unknown as {
    on(event: string, fn: AnyHookListener): void
    removeListener(event: string, fn: AnyHookListener): void
  }
  for (const h of HOOK_EVENTS) {
    const want = h.set.size > 0
    if (want && !attached.has(h.event)) {
      hook.on(h.event, h.fn as AnyHookListener)
      attached.add(h.event)
    } else if (!want && attached.has(h.event)) {
      hook.removeListener(h.event, h.fn as AnyHookListener)
      attached.delete(h.event)
    }
  }
  const need = attached.size > 0
  if (need && !hookRunning) {
    k.uIOhook.start()
    hookRunning = true
  } else if (!need && hookRunning) {
    k.uIOhook.stop()
    hookRunning = false
  }
}

function stopHook(): void {
  for (const h of HOOK_EVENTS) h.set.clear()
  syncHook()
}

function listen<T>(set: Set<T>, cb: T): () => void {
  if (!loadHook()) return () => undefined
  set.add(cb)
  syncHook()
  return () => {
    if (!set.delete(cb)) return
    syncHook()
  }
}

/**
 * Нажатие мыши в любом месте экрана (физические пиксели). Глобальный хук uiohook
 * запускается с первым подписчиком и останавливается с последним — пока открыто окно
 * Ctrl+D (клик мимо него закрывает окно, как в макете и в APT). В игру мы ничего не шлём.
 */
export function onGlobalMouseDown(cb: MouseListener): () => void {
  return listen(mouseDown, cb)
}

export function onGlobalMouseUp(cb: MouseListener): () => void {
  return listen(mouseUp, cb)
}

/** Движение мыши (физические пиксели) — подписываться только на время, пока оно действительно нужно. */
export function onGlobalMouseMove(cb: MouseListener): () => void {
  return listen(mouseMove, cb)
}

export function onGlobalWheel(cb: WheelListener): () => void {
  return listen(wheel, cb)
}

/** Нажатие клавиши (keycode uiohook и модификаторы); само нажатие уходит в игру как обычно. */
export function onGlobalKeyDown(cb: KeyListener): () => void {
  return listen(keyDown, cb)
}

/** Keycode uiohook клавиши по имени UiohookKey (`Escape`, `P`); null — модуля нет или имени. */
export function hookKeycode(name: string): number | null {
  const k = loadHook()
  const code = k ? (k.UiohookKey as unknown as Record<string, number>)[name] : undefined
  return typeof code === 'number' ? code : null
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

  // снимок + очистка буфера, затем Ctrl+C (сам HostClipboard: буфер в Electron 44 асинхронный)
  const text = await hostClipboard.readItemText(() => pressCopyKeys(k))
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
 * send — сразу отправить (Enter) и вернуть прежний канал чата. «@last» здесь не разбирается (S29): ник
 * подставляют команды из настроек (resolveChatText, @shared/chatCommands), а в чужом тексте (whisper трейда,
 * шаблон ответа сделки с предметом из whisper) «@last» в начале или в конце не должен менять адресата.
 * Текст — всегда одна строка (chatLine.ts): переводы строк → пробел, длиннее лимита — 'no-input'.
 */
export function typeInChat(input: string, opts: { send?: boolean } = {}): GameInputResult {
  const text = toGameLine(input)
  if (text === null) return 'no-input'
  const k = prepareInput()
  if (typeof k === 'string') return k
  const { uIOhook, UiohookKey: Key } = k
  const send = !!opts.send

  // запись в буфер — до первой клавиши: Ctrl+V должен вставить уже нашу строку
  const done = hostClipboard.restoreShortly(async (clipboard) => {
    const modifiers = process.platform === 'darwin' ? [Key.Meta] : [Key.Ctrl]

    await clipboard.writeText(text)
    uIOhook.keyTap(Key.Enter)
    if (!AUTO_CLEAR.includes(text[0])) {
      uIOhook.keyTap(Key.A, modifiers)
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

/**
 * Поиск в стэше/у торговца: Ctrl+F → вставить текст (→ Enter, если submit) — буфер вернётся
 * через 120 мс. submit по умолчанию как в APT (Enter снимает фокус с поля поиска); хоткеи
 * строк regex (pasteSearch1..5) вставляют без Enter. Текст — одна строка, как в typeInChat.
 */
export function stashSearch(input: string, opts: { submit?: boolean } = {}): GameInputResult {
  const text = toGameLine(input)
  if (text === null) return 'no-input'
  const k = prepareInput()
  if (typeof k === 'string') return k
  const { uIOhook, UiohookKey: Key } = k

  const done = hostClipboard.restoreShortly(async (clipboard) => {
    await clipboard.writeText(text)
    uIOhook.keyTap(Key.F, [Key.Ctrl])
    uIOhook.keyTap(Key.V, [process.platform === 'darwin' ? Key.Meta : Key.Ctrl])
    if (opts.submit !== false) uIOhook.keyTap(Key.Enter)
  })
  return done ? 'ok' : 'busy'
}
