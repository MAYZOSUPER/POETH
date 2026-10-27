// Акселераторы хоткеев (формат Electron: 'Control+Shift+D'): разбор, нормализация
// и правила «это сочетание назначать нельзя». Чистый модуль без electron:
// main (src/main/hotkeys.ts) не регистрирует запрещённые сочетания, renderer
// (экран хоткеев в настройках) не даёт их сохранить. Тесты — tests/overlay/accelerators.test.ts.

export type AccelModifier = 'Control' | 'Alt' | 'Shift' | 'Super'

/** Порядок модификаторов в канонической записи (как в экране настроек). */
const MOD_ORDER: readonly AccelModifier[] = ['Control', 'Alt', 'Shift', 'Super']

const MOD_ALIASES: Record<string, AccelModifier> = {
  control: 'Control',
  ctrl: 'Control',
  commandorcontrol: 'Control',
  cmdorctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'Alt',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
  command: 'Super',
  cmd: 'Super'
}

const KEY_ALIASES: Record<string, string> = {
  return: 'Enter',
  enter: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  up: 'Up',
  arrowup: 'Up',
  down: 'Down',
  arrowdown: 'Down',
  left: 'Left',
  arrowleft: 'Left',
  right: 'Right',
  arrowright: 'Right',
  del: 'Delete',
  delete: 'Delete',
  ins: 'Insert',
  insert: 'Insert',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  plus: 'Plus',
  capslock: 'CapsLock',
  numlock: 'NumLock',
  scrolllock: 'ScrollLock',
  printscreen: 'PrintScreen'
}

export interface ParsedAccelerator {
  /** модификаторы в каноническом порядке, без повторов */
  mods: AccelModifier[]
  /** основная клавиша в канонической записи: 'D', '1', 'F5', 'Space', 'Up', 'num5', '[' … */
  key: string
}

function canonicalKey(raw: string): string | null {
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower in KEY_ALIASES) return KEY_ALIASES[lower]
  if (/^[a-z]$/.test(lower)) return lower.toUpperCase()
  if (/^[0-9]$/.test(raw)) return raw
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return lower.toUpperCase()
  if (/^num([0-9]|add|sub|mult|div|dec)$/.test(lower)) return lower
  // одиночный символ пунктуации: [ ] ; ' , . / \ ` - =
  if (raw.length === 1) return raw
  return null
}

/** Разобрать акселератор; null — пусто или не акселератор (нет клавиши / две клавиши). */
export function parseAccelerator(accel: string): ParsedAccelerator | null {
  if (typeof accel !== 'string') return null
  const parts = accel.split('+').map((p) => p.trim())
  // 'Control++' (клавиша «+») Electron пишет как 'Plus' — пустые части = ошибка записи
  if (parts.some((p) => p === '')) return null
  const mods = new Set<AccelModifier>()
  let key: string | null = null
  for (const part of parts) {
    const mod = MOD_ALIASES[part.toLowerCase()]
    if (mod) {
      mods.add(mod)
      continue
    }
    if (key !== null) return null
    key = canonicalKey(part)
    if (key === null) return null
  }
  if (key === null) return null
  return { mods: MOD_ORDER.filter((m) => mods.has(m)), key }
}

/** Каноническая запись ('ctrl+shift+d' → 'Control+Shift+D'); null — не акселератор. */
export function normalizeAccelerator(accel: string): string | null {
  const p = parseAccelerator(accel)
  return p ? [...p.mods, p.key].join('+') : null
}

/** Одно и то же сочетание, записанное по-разному. */
export function sameAccelerator(a: string, b: string): boolean {
  const na = normalizeAccelerator(a)
  return na !== null && na === normalizeAccelerator(b)
}

// ---------------------------------------------------------------------------
// Запрещённые сочетания
// ---------------------------------------------------------------------------

/**
 * Почему сочетание нельзя назначить:
 * - `game`   — его использует игра или его отправляет в игру само приложение
 *              (Ctrl+C копирует предмет, Ctrl+F/V — поиск в стэше, Enter — чат…):
 *              глобальный хоткей перехватил бы и нажатие игрока, и наш собственный ввод;
 * - `typing` — обычный символ (буква/цифра/знак, в т.ч. с Shift): мешал бы печатать в чате;
 * - `system` — системное сочетание Windows.
 */
export type ReservedReason = 'game' | 'typing' | 'system'

const RESERVED_GAME = [
  'Control+C',
  'Control+Alt+C',
  'Control+V',
  'Control+A',
  'Control+F',
  'Control+X',
  'Control+Enter',
  'Enter',
  'Escape',
  'Tab',
  'Space',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'Up',
  'Down',
  'Left',
  'Right'
]

const RESERVED_SYSTEM = [
  'Alt+F4',
  'Alt+Tab',
  'Alt+Escape',
  'Alt+Space',
  'Control+Escape',
  'Control+Shift+Escape',
  'Control+Alt+Delete'
]

const GAME_SET = new Set(RESERVED_GAME)
const SYSTEM_SET = new Set(RESERVED_SYSTEM)

function isPrintableKey(key: string): boolean {
  return /^[A-Z0-9]$/.test(key) || /^num[0-9]$/.test(key) || key === 'Plus' || /^[^A-Za-z0-9]$/.test(key)
}

/** Причина запрета или null, если сочетание можно назначить. Пустая строка (не назначено) — null. */
export function reservedReason(accel: string): ReservedReason | null {
  const p = parseAccelerator(accel)
  if (!p) return null
  const norm = [...p.mods, p.key].join('+')
  if (SYSTEM_SET.has(norm)) return 'system'
  if (GAME_SET.has(norm)) return 'game'
  // Win+… перехватывает оболочка Windows
  if (p.mods.includes('Super')) return 'system'
  const typingMods = p.mods.every((m) => m === 'Shift')
  if (typingMods && isPrintableKey(p.key)) return 'typing'
  return null
}

/** Сочетание зарезервировано игрой/системой или мешает печатать — переназначать нельзя. */
export function isReservedAccelerator(accel: string): boolean {
  return reservedReason(accel) !== null
}

// ---------------------------------------------------------------------------
// Нажатие (KeyboardEvent / Electron Input) → акселератор
// ---------------------------------------------------------------------------

/** Минимум полей, общий для DOM KeyboardEvent и Electron `Input` (before-input-event). */
export interface KeyPress {
  /** физическая клавиша: 'KeyD', 'Digit1', 'Space', 'ArrowUp', 'Numpad5', 'F5' … */
  code: string
  /** символ/имя клавиши ('d', 'F5') — запасной вариант для F-клавиш */
  key?: string
  control?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

const CODE_KEYS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  Minus: '-',
  Equal: '='
}

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

/**
 * Каноническая клавиша по KeyboardEvent.code (раскладка не важна); null — модификатор/неизвестно.
 * Пустой code бывает у синтетических нажатий (SendInput без скан-кода) — тогда по key
 * (только латиница/цифры/служебные: кириллица зависит от раскладки).
 */
export function codeToAccelKey(code: string, key?: string): string | null {
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(code)) return null
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  if (key && /^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key
  if (code in CODE_KEYS) return CODE_KEYS[code]
  const num = /^Numpad([0-9])$/.exec(code)
  if (num) return `num${num[1]}`
  if (!code && key) {
    if (key in KEY_NAMES) return KEY_NAMES[key]
    if (/^[a-zA-Z0-9]$/.test(key)) return key.toUpperCase()
  }
  return null
}

/** Нажатие → канонический акселератор ('Control+D'); null — нажат только модификатор. */
export function keyPressToAccelerator(press: KeyPress): string | null {
  const key = codeToAccelKey(press.code, press.key)
  if (!key) return null
  const mods: AccelModifier[] = []
  if (press.control) mods.push('Control')
  if (press.alt) mods.push('Alt')
  if (press.shift) mods.push('Shift')
  if (press.meta) mods.push('Super')
  return [...mods, key].join('+')
}
