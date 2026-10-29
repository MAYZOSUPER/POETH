// Код Path of Building → XML (S35; чистый модуль, tests/pob/decode.test.ts).
// Формат PoB: base64url(zlib(XML)) — `base64.encode(Deflate(xml)):gsub("+","-"):gsub("/","_")`
// (ImportTab.lua). Обёртка zlib, поэтому код почти всегда начинается с «eN».
// Распаковка подставляется снаружи (inflateNode из advisor/codecNode.ts — zlib с maxOutputLength),
// здесь только формат и пределы: вход ≤ 1 МБ, XML ≤ 16 МБ (zip-бомба обрывается на пределе).

import { CodeTooLargeError, fromBase64Url } from '../advisor/codec'

/** Длина вставленного кода, символов: обычный код 5–70 КБ, 12 этапов с заметками — ~35 КБ. */
export const POB_CODE_MAX_CHARS = 1024 * 1024
/** XML после распаковки, байт: самый крупный реальный билд ~0,5 МБ. */
export const POB_XML_MAX_BYTES = 16 * 1024 * 1024

/** inflate с пределом: больше maxBytes — CodeTooLargeError, битые данные — любая другая ошибка. */
export type PobInflate = (bytes: Uint8Array, maxBytes: number) => Uint8Array

export type PobDecodeError =
  | 'empty' // ничего не вставлено
  | 'not-pob' // это не код PoB (не base64, не zlib, битые данные)
  | 'too-large' // код или распакованный XML больше предела

export type PobDecodeResult = { ok: true; xml: string } | { ok: false; error: PobDecodeError }

const CODE_RE = /^[A-Za-z0-9+/_-]+={0,2}$/

/**
 * Код из вставленного текста: пробелы и переносы строк внутри убираются (код из чата или мессенджера
 * бывает разбит на строки), стандартный base64 (+/) тоже принимается. null — не похоже на код.
 */
export function cleanPobCode(input: string): string | null {
  const s = String(input ?? '').replace(/\s+/g, '')
  if (!s || !CODE_RE.test(s)) return null
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Заголовок zlib: метод deflate (CM=8), окно ≤ 32 КБ, контрольная сумма заголовка, без словаря. */
function isZlib(b: Uint8Array): boolean {
  return b.length >= 2 && (b[0] & 0x0f) === 8 && b[0] >> 4 <= 7 && ((b[0] << 8) | b[1]) % 31 === 0 && (b[1] & 0x20) === 0
}

export function decodePobCode(input: string, inflate: PobInflate): PobDecodeResult {
  const text = String(input ?? '')
  if (!text.trim()) return { ok: false, error: 'empty' }
  if (text.length > POB_CODE_MAX_CHARS) return { ok: false, error: 'too-large' }
  const code = cleanPobCode(text)
  if (!code) return { ok: false, error: 'not-pob' }
  const bytes = fromBase64Url(code)
  if (!bytes || !isZlib(bytes)) return { ok: false, error: 'not-pob' }

  let raw: Uint8Array
  try {
    raw = inflate(bytes, POB_XML_MAX_BYTES)
  } catch (e) {
    return { ok: false, error: e instanceof CodeTooLargeError ? 'too-large' : 'not-pob' }
  }
  if (raw.length > POB_XML_MAX_BYTES) return { ok: false, error: 'too-large' }
  // PoB пишет UTF-8; битые байты станут U+FFFD — это лишь текст, не повод отвергать билд
  const xml = new TextDecoder('utf-8').decode(raw)
  if (!/^\s*(?:<\?xml[^>]*\?>\s*)?<PathOfBuilding2?[\s>]/.test(xml.slice(0, 512).replace(/^﻿/, ''))) {
    return { ok: false, error: 'not-pob' }
  }
  return { ok: true, xml }
}
