// «Скопировать предмет по-английски» (S51, идея №9 исследования; чистый модуль — tests/build/itemEnCopy.test.ts).
// Игрок с RU-клиентом наводит курсор на вещь и жмёт хоткей: main копирует предмет (одно Ctrl+C, как Ctrl+D), оверлей
// здесь собирает английский текст, main кладёт его в буфер — для PoB («Create custom» / Ctrl+V во вкладке Items) или
// англоязычного Discord. Пересборка — S44 (pobItemEn, режим `clipboard`): имя и база по EN-ключам данных, каждая строка
// мода — по стату. Что не перевелось — остаётся в тексте как есть с пометкой « (untranslated)», уведомление называет
// число таких строк. EN-клиент: текст и так английский — кладём как есть. Текст предмета на диск и в сеть не уходит.

import type { Poe1Data } from '../poe1/data'
import { parseClipboard } from '../poe1/parser/Parser'
import type { ItemLang } from '../types'
import { POB_ITEM_TEXT_MAX, pobItemText } from './pobItemEn'

export type ItemEnFail =
  /** нет данных языка (не загрузились) */
  | 'data'
  /** текст не разобрался как предмет PoE1 */
  | 'parse'
  /** не собрать: нет английского имени базы или текст слишком длинный */
  | 'build'

export type ItemEnCopy =
  | {
      ok: true
      /** 'as-is' — EN-клиент, текст как есть; 'translated' — собран заново на английском */
      mode: 'as-is' | 'translated'
      text: string
      /** строки, оставленные как есть (на языке клиента) */
      untranslated: string[]
    }
  | { ok: false; reason: ItemEnFail }

/**
 * Текст предмета на языке клиента → английский текст для буфера. `src` — данные языка предмета, `en` — английские
 * (для EN-клиента не нужны).
 */
export function itemEnCopy(raw: string, lang: ItemLang, src: Poe1Data | null, en: Poe1Data | null): ItemEnCopy {
  if (lang === 'en') {
    if (!raw.trim() || raw.length > POB_ITEM_TEXT_MAX) return { ok: false, reason: 'build' }
    return { ok: true, mode: 'as-is', text: raw, untranslated: [] }
  }
  if (!src || !en || src.lang !== lang || en.lang !== 'en') return { ok: false, reason: 'data' }
  const parsed = parseClipboard(raw, src)
  if (!parsed.ok) return { ok: false, reason: 'parse' }
  const built = pobItemText(parsed.value, src, en, { clipboard: true })
  if (!built) return { ok: false, reason: 'build' }
  return { ok: true, mode: 'translated', text: built.text, untranslated: built.untranslated }
}

export interface ItemEnNotice {
  /** ключ строки i18n (dict/overlay.ts) */
  key: string
  params?: Record<string, number>
  kind: 'info' | 'warn'
}

/** Что сказать игроку поверх игры. `written` — main положил текст в буфер. */
export function itemEnNotice(r: ItemEnCopy, written: boolean): ItemEnNotice {
  if (!r.ok || !written) return { key: 'overlay.itemEn.failed', kind: 'warn' }
  if (r.mode === 'as-is') return { key: 'overlay.itemEn.asIs', kind: 'info' }
  if (r.untranslated.length) return { key: 'overlay.itemEn.partial', params: { n: r.untranslated.length }, kind: 'warn' }
  return { key: 'overlay.itemEn.copied', kind: 'info' }
}
