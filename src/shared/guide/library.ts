// «Справочник» (S55): загрузка статей, поиск по заголовкам, отметки «новое / обновлено» (чистый модуль;
// tests/guide/library.test.ts). Чтение файла — снаружи: в renderer это fetch poeth://data/<игра>/guide/<файл>
// (протокол сам берёт обновлённый файл из userData/data, иначе встроенный), в тестах — подмена.

import type { GameId } from '../games'
import {
  GUIDE_INDEX,
  GUIDE_LIMITS,
  isNewerSchema,
  plainText,
  validateArticle,
  validateIndex,
  type GuideArticle,
  type GuideLang,
  type GuideSection
} from './article'

/** У каких игр есть «Справочник» (статьи пока только про PoE 1). Одно место, чтобы лид мог спрятать раздел. */
export function guideOn(game: GameId): boolean {
  return game === 'poe1'
}

/** Прочитать файл папки guide: текст или null (нет файла, ошибка чтения). */
export type GuideRead = (file: string) => Promise<string | null>

export interface GuideLoad {
  articles: GuideArticle[]
  /** статьи, которые не прошли проверку или не прочитались (id и причина — для лога) */
  failed: { id: string; error: string }[]
  /** статьи новой схемы: нужна новая версия POETH */
  newer: string[]
  /** список статей не прочитался или битый — раздел пуст */
  noIndex: boolean
}

async function readJson(read: GuideRead, file: string): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  let s: string | null
  try {
    s = await read(file)
  } catch {
    s = null
  }
  if (s === null) return { ok: false, error: 'нет файла' }
  // длина строки в UTF-16 ≤ байтам UTF-8 в 1–3 раза: проверяем по байтам
  if (new TextEncoder().encode(s).length > GUIDE_LIMITS.bytes) return { ok: false, error: `больше ${GUIDE_LIMITS.bytes} байт` }
  try {
    return { ok: true, raw: JSON.parse(s) as unknown }
  } catch {
    return { ok: false, error: 'не JSON' }
  }
}

/**
 * Список статей и сами статьи. Битая статья не ломает остальные: её нет в списке, она в failed.
 * Статья должна лежать в файле со своим id (<id>.json), иначе — failed.
 */
export async function loadGuide(read: GuideRead): Promise<GuideLoad> {
  const out: GuideLoad = { articles: [], failed: [], newer: [], noIndex: false }
  const idx = await readJson(read, GUIDE_INDEX)
  const index = idx.ok ? validateIndex(idx.raw) : null
  if (!index?.ok) {
    out.noIndex = true
    out.failed.push({ id: 'index', error: idx.ok ? (index as { error: string }).error : idx.error })
    return out
  }
  const loaded = await Promise.all(
    index.value.articles.map(async (id) => ({ id, file: await readJson(read, `${id}.json`) }))
  )
  for (const { id, file } of loaded) {
    if (!file.ok) {
      out.failed.push({ id, error: file.error })
      continue
    }
    if (isNewerSchema(file.raw)) {
      out.newer.push(id)
      continue
    }
    const a = validateArticle(file.raw)
    if (!a.ok) out.failed.push({ id, error: a.error })
    else if (a.value.id !== id) out.failed.push({ id, error: `в файле статья ${a.value.id}` })
    else out.articles.push(a.value)
  }
  return out
}

// ---------------------------------------------------------------------------
// Поиск по заголовкам
// ---------------------------------------------------------------------------

/** Для сравнения: строчные, ё → е, без знаков, пробелы схлопнуты. */
export function normQuery(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .trim()
}

export interface GuideHit {
  article: GuideArticle
  /** разделы, чьё название подошло (по ним можно сразу перейти) */
  sections: GuideSection[]
}

const titleOf = (t: { ru: string; en: string }): string => normQuery(`${plainText(t.ru)} ${plainText(t.en)}`)

/**
 * Поиск по названиям статей и разделов на обоих языках (игрок с RU-интерфейсом может искать «league»).
 * Все слова запроса должны найтись в названии статьи или одного раздела. Пустой запрос — все статьи.
 * Разделы для опытных в простом режиме тоже ищутся: статья откроется на них.
 */
export function searchGuide(articles: readonly GuideArticle[], query: string): GuideHit[] {
  const words = normQuery(query).split(' ').filter(Boolean)
  if (words.length === 0) return articles.map((article) => ({ article, sections: [] }))
  const has = (hay: string): boolean => words.every((w) => hay.includes(w))
  const hits: GuideHit[] = []
  for (const article of articles) {
    const sections = article.sections.filter((s) => has(titleOf(s.title)))
    if (has(titleOf(article.title)) || sections.length > 0) hits.push({ article, sections })
  }
  return hits
}

// ---------------------------------------------------------------------------
// «Новое / обновлено»
// ---------------------------------------------------------------------------

/** Прочитанные статьи: id → ревизия, которую игрок открывал. В localStorage окна (Settings не трогаем). */
export type GuideSeen = Record<string, number>

export const GUIDE_SEEN_KEY = 'poeth.guide.seen'

export type GuideMark = 'new' | 'updated' | null

/** Не открывали — «новое»; открывали старую ревизию — «обновлено». */
export function articleMark(a: GuideArticle, seen: GuideSeen): GuideMark {
  const r = seen[a.id]
  if (r === undefined) return 'new'
  return r < a.rev ? 'updated' : null
}

/** Сколько статей с отметкой — число на пункте рельса. */
export function unreadCount(articles: readonly GuideArticle[], seen: GuideSeen): number {
  return articles.filter((a) => articleMark(a, seen) !== null).length
}

/** Раздел изменился после ревизии, которую игрок видел (впервые открытая статья — без отметок у разделов). */
export function sectionUpdated(s: GuideSection, seenRev: number | undefined): boolean {
  return seenRev !== undefined && s.rev !== undefined && s.rev > seenRev
}

export function markSeen(seen: GuideSeen, a: GuideArticle): GuideSeen {
  return seen[a.id] === a.rev ? seen : { ...seen, [a.id]: a.rev }
}

export function markAllSeen(seen: GuideSeen, articles: readonly GuideArticle[]): GuideSeen {
  return articles.reduce(markSeen, seen)
}

export function readSeen(storage: { getItem(key: string): string | null } | undefined): GuideSeen {
  try {
    const v = JSON.parse(storage?.getItem(GUIDE_SEEN_KEY) ?? '{}') as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: GuideSeen = {}
    for (const [k, r] of Object.entries(v as Record<string, unknown>)) {
      if (typeof r === 'number' && Number.isInteger(r) && r > 0) out[k] = r
    }
    return out
  } catch {
    return {}
  }
}

export function writeSeen(storage: { setItem(key: string, value: string): void } | undefined, seen: GuideSeen): void {
  try {
    storage?.setItem(GUIDE_SEEN_KEY, JSON.stringify(seen))
  } catch {
    // нет хранилища — отметки просто не запомнятся
  }
}

// ---------------------------------------------------------------------------
// Показ
// ---------------------------------------------------------------------------

/** «Актуально для 3.29 / 3.30». */
export function patchLabel(a: GuideArticle): string {
  return a.patch.join(' / ')
}

/** Дата правки по языку: 30.10.2026 или 2026-10-30 → «Oct 30, 2026». */
export function dayLabel(day: string, lang: GuideLang): string {
  const [y, m, d] = day.split('-')
  if (lang === 'ru') return `${d}.${m}.${y}`
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[Number(m) - 1]} ${Number(d)}, ${y}`
}

/** Разделы для показа: в простом режиме — без разделов для опытных (они под отдельной кнопкой). */
export function visibleSections(a: GuideArticle, simple: boolean): { main: GuideSection[]; expert: GuideSection[] } {
  if (!simple) return { main: a.sections, expert: [] }
  return { main: a.sections.filter((s) => !s.expert), expert: a.sections.filter((s) => s.expert) }
}
