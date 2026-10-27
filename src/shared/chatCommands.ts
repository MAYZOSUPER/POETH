// Команды чата по хоткеям (как в APT: F5 → /hideout). Чистый модуль: пресеты, нормализация
// списка из настроек, подстановки @last / <char>, контекст из Client.txt и конфликты хоткеев.
// Используют: src/shared/settings.ts (нормализация), main (src/main/input/chatCommands.ts —
// регистрация и выполнение), renderer (раздел «Команды чата» в настройках).
// Тесты — tests/overlay/chatCommands.test.ts.
//
// Команды сверены с poewiki (страница Chat, раздел Commands) и дефолтами Awakened PoE Trade
// (renderer/src/web/Config.ts, MIT): /hideout F5, /exit F9, @last ty, /invite @last,
// /tradewith @last, /hideout @last. У нас хоткей по умолчанию только у /hideout.

import type { HotkeyAction, HotkeyMap } from './types/settings'
import type { ChatCommand } from './types/overlay'
import { normalizeAccelerator, reservedReason, sameAccelerator, type ReservedReason } from './accelerators'
import { parseLogLine, splitLogLine } from './deals/whisperParse'

/** Пресеты по умолчанию. id пресета = ключ подписи `overlay.chat.preset.<id>` в i18n. */
export const CHAT_PRESETS: readonly ChatCommand[] = [
  { id: 'hideout', text: '/hideout', hotkey: 'F5', send: true, enabled: true },
  { id: 'exit', text: '/exit', hotkey: '', send: true, enabled: true },
  { id: 'thanks', text: '@last ty', hotkey: '', send: true, enabled: true },
  { id: 'invite', text: '/invite @last', hotkey: '', send: true, enabled: true },
  { id: 'tradewith', text: '/tradewith @last', hotkey: '', send: true, enabled: true },
  { id: 'visit', text: '/hideout @last', hotkey: '', send: true, enabled: true },
  { id: 'leave', text: '/leave', hotkey: '', send: true, enabled: true },
  { id: 'remaining', text: '/remaining', hotkey: '', send: true, enabled: true },
  { id: 'menagerie', text: '/menagerie', hotkey: '', send: true, enabled: true },
  { id: 'delve', text: '/delve', hotkey: '', send: true, enabled: true },
  { id: 'afk', text: '/afk', hotkey: '', send: true, enabled: true },
  { id: 'dnd', text: '/dnd', hotkey: '', send: true, enabled: true }
]

export const CHAT_PRESET_IDS: ReadonlySet<string> = new Set(CHAT_PRESETS.map((c) => c.id))

export function defaultChatCommands(): ChatCommand[] {
  return CHAT_PRESETS.map((c) => ({ ...c }))
}

export const MAX_CHAT_COMMANDS = 40
/** Длинные строки в чат PoE не влезут — режем (сообщение игры ~ до 255 символов). */
export const MAX_CHAT_TEXT = 255

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/

/** Новый id своей команды, не совпадающий с занятыми. */
export function newChatCommandId(taken: Iterable<string>): string {
  const used = new Set(taken)
  for (let i = 1; ; i++) {
    const id = `custom-${i}`
    if (!used.has(id)) return id
  }
}

/** Текст команды: одна строка без переводов строк, обрезан по краям и по длине. */
export function cleanChatText(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_CHAT_TEXT)
}

/**
 * Нормализовать список из settings.json. Не массив — null (тогда берутся пресеты по
 * умолчанию). Пустой массив остаётся пустым: игрок удалил все команды сам.
 */
export function normalizeChatCommands(raw: unknown): ChatCommand[] | null {
  if (!Array.isArray(raw)) return null
  const out: ChatCommand[] = []
  const ids = new Set<string>()
  for (const item of raw) {
    if (out.length >= MAX_CHAT_COMMANDS) break
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const r = item as Record<string, unknown>
    const text = typeof r.text === 'string' ? cleanChatText(r.text) : ''
    if (!text) continue
    let id = typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : ''
    if (!id || ids.has(id)) id = newChatCommandId(ids)
    ids.add(id)
    const hotkey = typeof r.hotkey === 'string' ? (normalizeAccelerator(r.hotkey) ?? '') : ''
    out.push({
      id,
      text,
      hotkey,
      send: typeof r.send === 'boolean' ? r.send : true,
      enabled: typeof r.enabled === 'boolean' ? r.enabled : true
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Подстановки
// ---------------------------------------------------------------------------

const LAST_RE = /@last\b/gi
const CHAR_RE = /<char>/gi

export interface ChatContext {
  /** ник последнего, кто писал вам в whisper (@From / @От кого) */
  lastWhisperFrom: string | null
  /** ваш персонаж (из лога: «<ник> (<класс>) is now level N»), если известен */
  character: string | null
}

export function chatPlaceholders(text: string): { last: boolean; char: boolean } {
  return { last: /@last\b/i.test(text), char: /<char>/i.test(text) }
}

export type ResolvedChat = { ok: true; text: string } | { ok: false; missing: 'last' | 'char' }

/**
 * Подставить ники. `@last` в начале — адресат whisper: «@last ty» → «@Ник ty»; в остальных
 * местах — просто ник: «/invite @last» → «/invite Ник». `<char>` → ваш персонаж.
 * Неизвестная подстановка — отказ (команду не отправляем).
 */
export function resolveChatText(text: string, ctx: ChatContext): ResolvedChat {
  const need = chatPlaceholders(text)
  if (need.last && !ctx.lastWhisperFrom) return { ok: false, missing: 'last' }
  if (need.char && !ctx.character) return { ok: false, missing: 'char' }
  let out = text
  if (need.last) {
    const name = ctx.lastWhisperFrom as string
    // один проход: ник «Last» не должен сам стать подстановкой
    out = out.replace(LAST_RE, (_m, offset: number) => (offset === 0 ? `@${name}` : name))
  }
  if (need.char) out = out.replace(CHAR_RE, ctx.character as string)
  return { ok: true, text: out }
}

// ---------------------------------------------------------------------------
// Контекст из Client.txt
// ---------------------------------------------------------------------------

// «: <Ник> (<Класс>) is now level N» — как в logTailer (класс может содержать пробелы).
const LEVEL_UP = /^:\s+(\S+)(?:\s+\([^)]+\))?\s+is now level\s+\d+/

/** Следит за строками лога: последний входящий whisper и свой персонаж. */
export class ChatLogContext implements ChatContext {
  lastWhisperFrom: string | null = null
  character: string | null = null

  feed(lines: readonly string[]): void {
    for (const line of lines) {
      const ev = parseLogLine(line)
      if (ev?.type === 'whisper') {
        if (ev.dir === 'in' && ev.player) this.lastWhisperFrom = ev.player
        continue
      }
      const ll = splitLogLine(line)
      const lv = ll ? LEVEL_UP.exec(ll.text) : null
      if (lv) this.character = lv[1]
    }
  }

  reset(): void {
    this.lastWhisperFrom = null
    this.character = null
  }
}

// ---------------------------------------------------------------------------
// Хоткеи
// ---------------------------------------------------------------------------

/** Действие хоткея команды чата (регистрируется динамически, src/main/hotkeys.ts). */
export type ChatHotkeyId = `chat:${string}`

export function chatHotkeyId(id: string): ChatHotkeyId {
  return `chat:${id}`
}

export type HotkeyConflict =
  | { kind: 'reserved'; reason: ReservedReason }
  | { kind: 'action'; action: HotkeyAction }
  | { kind: 'chat'; id: string }

/**
 * Можно ли назначить сочетание: не занято игрой/системой и не повторяет другой хоткей
 * (обычное действие или команду чата). `self` — что сейчас переназначаем (не конфликт с собой).
 */
export function findHotkeyConflict(
  accel: string,
  current: { hotkeys: HotkeyMap; chatCommands: readonly ChatCommand[] },
  self: { action?: HotkeyAction; chatId?: string } = {}
): HotkeyConflict | null {
  const reason = reservedReason(accel)
  if (reason) return { kind: 'reserved', reason }
  for (const [action, binding] of Object.entries(current.hotkeys) as [HotkeyAction, { accel: string }][]) {
    if (action !== self.action && binding.accel && sameAccelerator(binding.accel, accel)) return { kind: 'action', action }
  }
  for (const c of current.chatCommands) {
    if (c.id !== self.chatId && c.hotkey && sameAccelerator(c.hotkey, accel)) return { kind: 'chat', id: c.id }
  }
  return null
}
