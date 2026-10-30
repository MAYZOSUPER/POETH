import type { LootFilterConfirmReason, LootFilterLevel } from '../types/lootFilter'
import { levelDef } from './levels'

// Правила записи фильтра в папку игры и проверки обновлений (S53) — чистые функции.
//  - Имя файла — всегда своё: POETH-NeverSink-<уровень>.filter. Чужие фильтры игрока (другие имена) мы не
//    открываем на запись никогда; путь строится только из уровня, не из архива и не из ввода renderer.
//  - Свой файл перезаписываем молча, только если он не менялся после установки (SHA-256 как при установке);
//    изменён или POETH его не помнит — только после «Перезаписать» игрока.
//  - Проверка новой версии — не чаще раза в сутки и только при открытом экране или с галочкой «Проверять».

export const FILE_PREFIX = 'POETH-NeverSink-'

/** Свой файл уровня: `POETH-NeverSink-1-REGULAR.filter`. Стиль — внутри файла (игроку не надо выбирать файл заново). */
export function installedFileName(level: LootFilterLevel): string {
  return `${FILE_PREFIX}${levelDef(level).code}.filter`
}

const OUR_NAME = /^POETH-NeverSink-[0-6]-[A-Z]+(?:-[A-Z]+)*\.filter$/

/** Имя — наш файл (для записи в манифесте и проверки перед записью). */
export function isOurFileName(name: unknown): name is string {
  return typeof name === 'string' && OUR_NAME.test(name)
}

export type WriteDecision = 'create' | 'replace' | 'refuse' | { confirm: LootFilterConfirmReason }

export interface WriteFacts {
  /** по пути что-то есть */
  exists: boolean
  /** это обычный файл (не папка, не ссылка) */
  regularFile: boolean
  /** SHA-256 из манифеста (что мы записали); null — POETH этот файл не помнит */
  recordedSha: string | null
  /** SHA-256 файла сейчас; null — не прочитали (слишком большой, нет доступа) */
  currentSha: string | null
  /** игрок нажал «Перезаписать» */
  confirmed: boolean
}

/** Что делать с путём записи своего файла. */
export function decideWrite(f: WriteFacts): WriteDecision {
  if (!f.exists) return 'create'
  if (!f.regularFile) return 'refuse'
  if (f.recordedSha && f.currentSha && f.recordedSha === f.currentSha) return 'replace'
  if (f.confirmed) return 'replace'
  return { confirm: f.recordedSha ? 'modified' : 'unknown' }
}

export interface FilterHeader {
  version?: string
  type?: string
  style?: string
}

/** Шапка фильтра NeverSink (`# VERSION:  8.20.2`, `# TYPE: 1-REGULAR`, `# STYLE: DEFAULT`) из первых строк. */
export function parseFilterHeader(text: string): FilterHeader {
  const head = text.slice(0, 4000)
  const pick = (key: string): string | undefined => {
    const m = new RegExp(`^#\\s*${key}:\\s*([^\\r\\n]{1,60})`, 'm').exec(head)
    return m ? m[1].trim() : undefined
  }
  return { version: pick('VERSION'), type: pick('TYPE'), style: pick('STYLE') }
}

/** Наибольший размер одного файла фильтра (у NeverSink ~0,5 МБ). */
export const MAX_FILTER_BYTES = 8 * 1024 * 1024

/**
 * Похоже на фильтр NeverSink: текст UTF-8 без NUL, шапка «NeverSink's … Loot Filter», есть правила Show/Hide.
 * Защита от «не того файла» в архиве: в папку игры уходит только такой текст.
 */
export function looksLikeNeverSinkFilter(bytes: Uint8Array): boolean {
  if (bytes.length < 64 || bytes.length > MAX_FILTER_BYTES) return false
  if (bytes.includes(0)) return false
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return false
  }
  if (!/NeverSink'?s\b[^\r\n]{0,40}Loot Filter/i.test(text.slice(0, 2000))) return false
  return /^(Show|Hide|Minimal)\b/m.test(text)
}

/** Сутки — не чаще проверяем GitHub сами (кнопка «Установить» спрашивает всегда: это действие игрока). */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface CheckFacts {
  now: number
  lastCheckAt: number | null
  /** экран «Фильтр лута» открыт */
  screenOpen: boolean
  /** игрок включил «Проверять раз в сутки» */
  autoCheck: boolean
}

/** Пора ли спросить GitHub о новой версии без нажатия кнопки. */
export function shouldCheck(f: CheckFacts): boolean {
  if (!f.screenOpen && !f.autoCheck) return false
  if (f.lastCheckAt === null) return true
  // часы перевели назад — не ждём лишние сутки
  if (f.lastCheckAt > f.now + 60 * 60 * 1000) return true
  return f.now - f.lastCheckAt >= CHECK_INTERVAL_MS
}
