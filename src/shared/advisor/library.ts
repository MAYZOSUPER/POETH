// Свои стратегии и каталог сообщества (S17; чистый модуль, tests/advisor/library.test.ts).
//
// Свои — userData/advisor/my-strategies.json (атомарная запись в main): созданные в редакторе (source.kind =
// mine) и добавленные по коду (imported). Каталог сообщества — файлы resources/data/poe1/advisor/community/
// <id>.json (едут каналом данных S12, их же собирает сайт), каждый добавляет лид инструментом
// tools/advisor/add-strategy.mjs. Всё, что приходит снаружи, проходит validateStrategy.
//
// Импорт («Уже есть»): та же стратегия где угодно (по отпечатку) — «уже есть, открыть её»; свой с тем же id,
// но другой — «Заменить мою» (id сохраняется, а с ним и «Мой результат» по сессиям фарма) или «Добавить
// копией» (новый id); наш или из каталога с тем же id — только копией.

import type { AdvisorImportExisting, AdvisorImportMatch, AdvisorImportMode, AdvisorStrategy } from '../types/advisor'
import { strategyFingerprint } from './codec'
import { LIMITS, STRATEGY_ID, plain, validateStrategy } from './validate'

/** Файл своих стратегий внутри userData. */
export const LIBRARY_FILE = 'advisor/my-strategies.json'
export const LIBRARY_SCHEMA = 1
/** Своих стратегий не больше (файл читается целиком при каждом пересчёте). */
export const MAX_LIBRARY = 200
/** Черновик редактора, байт JSON. */
export const MAX_DRAFT_BYTES = 128 * 1024
/** Папка каталога сообщества внутри данных игры (resources/data/poe1, userData/data/poe1). */
export const COMMUNITY_DIR = 'advisor/community'

const DAY = /^\d{4}-\d{2}-\d{2}$/

export interface LibraryEntry {
  /** source.kind — mine или imported */
  strategy: AdvisorStrategy
  /** YYYY-MM-DD */
  addedAt: string
}

export interface Library {
  /** ник для «Поделиться»; '' — не указан */
  nick: string
  items: LibraryEntry[]
  /** черновик редактора (форму проверяет редактор; здесь — только размер) */
  draft: unknown | null
}

export const emptyLibrary = (): Library => ({ nick: '', items: [], draft: null })

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Дата YYYY-MM-DD по локальному времени. */
export function today(now: number = Date.now()): string {
  const d = new Date(now)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Ник: простой текст до 40 символов; иначе пусто. */
export function cleanNick(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return ''
  try {
    return plain(v, 'nick', LIMITS.author)
  } catch {
    return ''
  }
}

function draftOk(v: unknown): boolean {
  if (!isObj(v)) return false
  try {
    return JSON.stringify(v).length <= MAX_DRAFT_BYTES
  } catch {
    return false
  }
}

/** Свой источник: только mine или imported (что угодно другое из файла — imported). */
function ownKind(s: AdvisorStrategy): AdvisorStrategy {
  return s.source.kind === 'mine' || s.source.kind === 'imported' ? s : { ...s, source: { ...s.source, kind: 'imported' } }
}

/** Файл своих стратегий → проверенные записи; битые и повторы id отбрасываются по одной. */
export function parseLibrary(raw: unknown): { library: Library; invalid: number } {
  const library = emptyLibrary()
  if (!isObj(raw) || raw.schema !== LIBRARY_SCHEMA) return { library, invalid: 0 }
  library.nick = cleanNick(raw.nick)
  if (draftOk(raw.draft)) library.draft = raw.draft
  let invalid = 0
  const seen = new Set<string>()
  for (const e of Array.isArray(raw.items) ? raw.items.slice(0, MAX_LIBRARY) : []) {
    const res = isObj(e) ? validateStrategy(e.strategy) : null
    if (!res?.ok || seen.has(res.strategy.id)) {
      invalid++
      continue
    }
    seen.add(res.strategy.id)
    const addedAt = isObj(e) && typeof e.addedAt === 'string' && DAY.test(e.addedAt) ? e.addedAt : res.strategy.source.date
    library.items.push({ strategy: ownKind(res.strategy), addedAt })
  }
  return { library, invalid }
}

export function serializeLibrary(l: Library): Record<string, unknown> {
  return { schema: LIBRARY_SCHEMA, nick: l.nick, items: l.items, ...(l.draft ? { draft: l.draft } : {}) }
}

/** Свободный id: base (приведённый к правилам id), иначе base-2, base-3… — не длиннее 48 символов. */
export function freeId(base: string, taken: ReadonlySet<string>): string {
  let b = base
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!b || !STRATEGY_ID.test(b)) b = 'strategy'
  b = b.slice(0, 48).replace(/-+$/, '') || 'strategy'
  if (!taken.has(b)) return b
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const id = b.slice(0, 48 - suffix.length).replace(/-+$/, '') + suffix
    if (!taken.has(id)) return id
  }
}

/** id из названия (латиница и цифры); кириллица и прочее — «my-strategy». */
export function idFromName(name: string, taken: ReadonlySet<string>): string {
  const latin = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return freeId(latin.length >= 3 ? `my-${latin}` : 'my-strategy', taken)
}

/** Чужая стратегия по коду: вид источника из кода не доверяем. Автор, ссылка и дата сохраняются (атрибуция). */
export function asImported(s: AdvisorStrategy): AdvisorStrategy {
  return { ...s, source: { ...s.source, kind: 'imported' } }
}

/** Своя копия чужой стратегии («Копия» у нашей или из каталога): новый id, источник mine, без чужого замера. */
export function copyAsMine(s: AdvisorStrategy, taken: ReadonlySet<string>, date: string): AdvisorStrategy {
  const { measured: _m, ...rest } = s
  return { ...rest, id: freeId(s.id.startsWith('my-') ? s.id : `my-${s.id}`, taken), source: { kind: 'mine', date }, draft: false }
}

export interface ImportPlan {
  match: AdvisorImportMatch
  existing: AdvisorImportExisting | null
}

const existingOf = (s: AdvisorStrategy): AdvisorImportExisting => ({ id: s.id, kind: s.source.kind, name: s.name })

/** Что делать с импортом: такая уже есть (где угодно), конфликт по id или новая. */
export function importPlan(s: AdvisorStrategy, library: Library, builtins: readonly AdvisorStrategy[]): ImportPlan {
  const fp = strategyFingerprint(s)
  const all = [...builtins, ...library.items.map((e) => e.strategy)]
  const same = all.find((x) => strategyFingerprint(x) === fp)
  if (same) return { match: 'same', existing: existingOf(same) }
  const byId = library.items.find((e) => e.strategy.id === s.id)?.strategy ?? builtins.find((b) => b.id === s.id)
  if (byId) return { match: 'conflict', existing: existingOf(byId) }
  return { match: 'new', existing: null }
}

export type ApplyImportResult = { ok: true; library: Library; id: string } | { ok: false; error: 'exists' | 'full' }

/**
 * Добавить импорт. add — только новую; replace — только свою с тем же id (id и «Мой результат» сохраняются);
 * copy — с новым id. Наши и из каталога заменить нельзя.
 */
export function applyImport(
  library: Library,
  decoded: AdvisorStrategy,
  mode: AdvisorImportMode,
  builtins: readonly AdvisorStrategy[],
  date: string
): ApplyImportResult {
  const s = asImported(decoded)
  const plan = importPlan(s, library, builtins)
  if (plan.match === 'same') return { ok: false, error: 'exists' }
  const items = [...library.items]
  if (mode === 'replace') {
    const i = items.findIndex((e) => e.strategy.id === s.id)
    if (plan.match !== 'conflict' || i < 0) return { ok: false, error: 'exists' }
    items[i] = { strategy: s, addedAt: date }
    return { ok: true, library: { ...library, items }, id: s.id }
  }
  if (items.length >= MAX_LIBRARY) return { ok: false, error: 'full' }
  if (mode === 'add' && plan.match !== 'new') return { ok: false, error: 'exists' }
  const taken = new Set([...builtins.map((b) => b.id), ...items.map((e) => e.strategy.id)])
  const id = mode === 'copy' ? freeId(s.id, taken) : s.id
  items.push({ strategy: { ...s, id }, addedAt: date })
  return { ok: true, library: { ...library, items }, id }
}

/** Сохранить свою (из редактора): source.kind = mine; тот же id — замена, иначе новая. */
export function upsertMine(library: Library, s: AdvisorStrategy, date: string): ApplyImportResult {
  const mine: AdvisorStrategy = { ...s, source: { ...s.source, kind: 'mine' } }
  const items = [...library.items]
  const i = items.findIndex((e) => e.strategy.id === mine.id)
  if (i >= 0) items[i] = { strategy: mine, addedAt: items[i].addedAt }
  else if (items.length >= MAX_LIBRARY) return { ok: false, error: 'full' }
  else items.push({ strategy: mine, addedAt: date })
  return { ok: true, library: { ...library, items }, id: mine.id }
}

export function removeEntry(library: Library, id: string): Library {
  return { ...library, items: library.items.filter((e) => e.strategy.id !== id) }
}

// ---------------------------------------------------------------------------- каталог сообщества

export interface CommunityEntry {
  strategy: AdvisorStrategy
  /** когда проверена и принята (YYYY-MM-DD) */
  checked: string
  /** номер заявки на GitHub (для истории) */
  issue?: number
}

const COMMUNITY_FIELDS = ['schema', 'checked', 'issue', 'strategy']

/**
 * Файл каталога → стратегия. Строго: схема 1, только известные поля, source.kind = community, имя файла =
 * id стратегии (если передано).
 */
export function parseCommunityFile(raw: unknown, fileId?: string): { ok: true; entry: CommunityEntry } | { ok: false; error: string } {
  if (!isObj(raw)) return { ok: false, error: 'не объект' }
  const extra = Object.keys(raw).filter((k) => !COMMUNITY_FIELDS.includes(k))
  if (extra.length) return { ok: false, error: `неизвестные поля ${extra.join(', ')}` }
  if (raw.schema !== LIBRARY_SCHEMA) return { ok: false, error: 'схема не 1' }
  if (typeof raw.checked !== 'string' || !DAY.test(raw.checked)) return { ok: false, error: 'checked: дата YYYY-MM-DD' }
  if (raw.issue !== undefined && !(Number.isInteger(raw.issue) && (raw.issue as number) > 0)) return { ok: false, error: 'issue: номер' }
  const res = validateStrategy(raw.strategy)
  if (!res.ok) return { ok: false, error: res.error }
  if (res.strategy.source.kind !== 'community') return { ok: false, error: 'source.kind должен быть community' }
  if (fileId !== undefined && fileId !== res.strategy.id) return { ok: false, error: `имя файла ${fileId}.json не совпадает с id ${res.strategy.id}` }
  const entry: CommunityEntry = { strategy: res.strategy, checked: raw.checked }
  if (raw.issue !== undefined) entry.issue = raw.issue as number
  return { ok: true, entry }
}

/** Стратегия из кода → файл каталога (source.kind = community, автор и ссылка сохраняются). */
export function communityFile(s: AdvisorStrategy, checked: string, issue?: number): Record<string, unknown> {
  const strategy: AdvisorStrategy = { ...s, draft: false, source: { ...s.source, kind: 'community' } }
  return { schema: LIBRARY_SCHEMA, checked, ...(issue ? { issue } : {}), strategy }
}
