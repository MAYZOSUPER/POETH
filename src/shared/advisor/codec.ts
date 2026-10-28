// Код стратегии для обмена (S17; чистый модуль, tests/advisor/codec.test.ts): как в PoB —
// `POETH1:` + base64url(deflate(JSON)). Тот же модуль работает в main (zlib — codecNode.ts), в инструментах
// (tools/advisor) и на сайте (бандл site/strategies/strategy-core.js, DecompressionStream — codecBrowser.ts):
// сжатие подставляется снаружи, здесь только формат и проверки.
//
// Код — недоверенные данные:
//  - лимит размера до распаковки (длина кода) и после (байт JSON) — защита от zip-бомбы;
//  - после распаковки — всегда строгий validateStrategy без значений по умолчанию;
//  - вид источника из кода не доверяется: импорт ставит imported сам (library.ts).
// Внутри — { schema, strategy }: префикс POETH<N> — версия кода, schema — версия модели. Новее любой из
// них — «обновите POETH».

import { ADVISOR_SCHEMA, type AdvisorCodeError, type AdvisorStrategy } from '../types/advisor'
import { validateStrategy } from './validate'

/** Версия формата кода (цифра в префиксе). */
export const CODE_VERSION = 1
export const CODE_PREFIX = `POETH${CODE_VERSION}:`
/**
 * Длина кода до распаковки, символов: обычная RU+EN стратегия ≈ 2 тыс.; предел — с запасом на самую большую
 * допустимую валидатором и меньше лимита командной строки Windows (ссылка протокола, 32 767).
 */
export const MAX_CODE_CHARS = 32_000
/** JSON после распаковки, байт: самая большая допустимая валидатором стратегия (кириллица — 2 байта) < 64 КБ. */
export const MAX_JSON_BYTES = 64 * 1024

/** Распаковка не уложилась в лимит (zip-бомба или просто огромный код). */
export class CodeTooLargeError extends Error {
  constructor() {
    super('too large')
  }
}

/** deflate (zlib-обёртка, как CompressionStream('deflate') и zlib.deflateSync). */
export type Deflate = (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>
/** inflate с пределом: больше maxBytes — бросить CodeTooLargeError, битые данные — любую другую ошибку. */
export type Inflate = (bytes: Uint8Array, maxBytes: number) => Uint8Array | Promise<Uint8Array>

export type DecodeResult =
  | { ok: true; strategy: AdvisorStrategy; code: string }
  | { ok: false; error: AdvisorCodeError; detail?: string }

const CODE_RE = /^POETH(\d{1,3}):([A-Za-z0-9_-]*)$/
const B64URL = /^[A-Za-z0-9_-]*$/

/**
 * Код из того, что вставил игрок: сам код, ссылка на страницу сайта (`…/strategies/view#POETH1:…`) или
 * ссылка протокола (`poeth-strategy://import#POETH1:…`). Переносы строк и пробелы внутри (чат, мессенджеры)
 * убираются. null — кода не видно.
 */
export function extractCode(input: string): string | null {
  let s = String(input ?? '').trim()
  if (!s) return null
  const at = s.search(/POETH\d{1,3}(:|%3A)/i)
  if (at < 0) return null
  s = s.slice(at)
  if (/%[0-9A-F]{2}/i.test(s)) {
    try {
      s = decodeURIComponent(s)
    } catch {
      /* как есть */
    }
  }
  s = s.replace(/\s+/g, '')
  // хвост после кода (кавычки, точка в конце фразы) отрезаем по первому символу не из base64url
  const m = /^(POETH\d{1,3}:[A-Za-z0-9_-]*)/i.exec(s)
  return m ? m[1].replace(/^poeth/i, 'POETH') : null
}

// ---------------------------------------------------------------------------- base64url (без Buffer: сайт)

export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** null — не base64url (лишние символы или невозможная длина). */
export function fromBase64Url(s: string): Uint8Array | null {
  if (!B64URL.test(s) || s.length % 4 === 1) return null
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  let bin: string
  try {
    bin = atob(b64)
  } catch {
    return null
  }
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------------------------------------------------------------------------- код

/** Что уходит в код: сама стратегия схемы 1 (аккаунта, тайника, цен и истории сессий в модели нет). */
export function codePayload(s: AdvisorStrategy): { schema: number; strategy: AdvisorStrategy } {
  return { schema: ADVISOR_SCHEMA, strategy: s }
}

/** Стратегия → `POETH1:…`. Стратегия должна быть проверена (validateStrategy). */
export async function encodeStrategy(s: AdvisorStrategy, deflate: Deflate): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(codePayload(s)))
  return CODE_PREFIX + toBase64Url(await deflate(json))
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Код (или ссылка с кодом) → проверенная стратегия. Источник в ней — как в коде (не доверять). */
export async function decodeStrategyCode(input: string, inflate: Inflate): Promise<DecodeResult> {
  if (!String(input ?? '').trim()) return { ok: false, error: 'empty' }
  const code = extractCode(input)
  if (!code) return { ok: false, error: 'notcode' }
  if (code.length > MAX_CODE_CHARS) return { ok: false, error: 'toolarge' }
  const m = CODE_RE.exec(code)
  if (!m) return { ok: false, error: 'notcode' }
  const version = Number(m[1])
  if (version > CODE_VERSION) return { ok: false, error: 'newer' }
  if (version !== CODE_VERSION) return { ok: false, error: 'notcode' }
  const bytes = m[2] ? fromBase64Url(m[2]) : null
  if (!bytes || !bytes.length) return { ok: false, error: 'broken' }

  let raw: Uint8Array
  try {
    raw = await inflate(bytes, MAX_JSON_BYTES)
  } catch (e) {
    return { ok: false, error: e instanceof CodeTooLargeError ? 'toolarge' : 'broken' }
  }
  if (raw.length > MAX_JSON_BYTES) return { ok: false, error: 'toolarge' }

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw))
  } catch {
    return { ok: false, error: 'broken' }
  }
  if (!isObj(payload) || typeof payload.schema !== 'number') return { ok: false, error: 'invalid', detail: 'нет версии схемы' }
  if (payload.schema > ADVISOR_SCHEMA) return { ok: false, error: 'newer' }
  if (payload.schema !== ADVISOR_SCHEMA) return { ok: false, error: 'invalid', detail: 'неизвестная версия схемы' }
  const extra = Object.keys(payload).filter((k) => k !== 'schema' && k !== 'strategy')
  if (extra.length) return { ok: false, error: 'invalid', detail: `неизвестные поля ${extra.join(', ')}` }
  const res = validateStrategy(payload.strategy)
  if (!res.ok) return { ok: false, error: 'invalid', detail: res.error }
  return { ok: true, strategy: res.strategy, code }
}

/**
 * Отпечаток стратегии для сравнения «уже есть» и «в каталоге»: содержание — без источника (вид, автор, дата:
 * импорт ставит imported, каталог — community, «Поделиться» добавляет ник к своей) и пометки черновика.
 * Валидатор строит объекты в одном порядке полей, поэтому JSON детерминирован.
 */
export function strategyFingerprint(s: AdvisorStrategy): string {
  const { draft: _draft, source: _source, ...rest } = s
  return JSON.stringify(rest)
}
