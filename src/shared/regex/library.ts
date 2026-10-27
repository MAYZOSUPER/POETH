// Библиотека своих строк: нормализация файла, правки, слоты хоткеев, экспорт/импорт.
// Чистые функции — их зовёт main (regexLibraryStore) и тесты.

import type { GameId } from '../games'
import type {
  MapQuery,
  PasteSlot,
  RegexEntry,
  RegexEntryInput,
  RegexLibrary,
  RegexPrefs,
  TriState,
  VendorQuery
} from '../types/regex'
import { REGEX_LIMIT } from './format'
import { MAP_LABEL_KEYS, emptyMapQuery } from './maps'
import { emptyVendorQuery } from './vendor'

export const LIBRARY_EXPORT_FORMAT = 'poeth-regex'
export const NAME_MAX = 80

const GAMES: readonly GameId[] = ['poe1', 'poe2']
const SLOTS: readonly PasteSlot[] = [1, 2, 3, 4, 5]

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export function defaultRegexPrefs(): RegexPrefs {
  return { gameLang: 'auto', page: 'maps', maps: emptyMapQuery(), vendor: emptyVendorQuery() }
}

export function emptyLibrary(): RegexLibrary {
  return { version: 1, prefs: defaultRegexPrefs(), entries: [] }
}

function isSlot(v: unknown): v is PasteSlot {
  return typeof v === 'number' && (SLOTS as readonly number[]).includes(v)
}

/** Запись из файла/импорта → валидная запись или null (пустое имя/текст, длиннее лимита). */
export function sanitizeEntry(raw: unknown, fallbackId: () => string): RegexEntry | null {
  if (!isObj(raw)) return null
  const name = str(raw.name)?.trim().slice(0, NAME_MAX)
  const text = str(raw.text)?.trim()
  if (!name || !text || text.length > REGEX_LIMIT) return null
  const game = GAMES.includes(raw.game as GameId) ? (raw.game as GameId) : 'poe1'
  const entry: RegexEntry = { id: str(raw.id) || fallbackId(), name, text, game }
  if (isSlot(raw.slot)) entry.slot = raw.slot
  const presetId = str(raw.presetId)
  if (presetId) entry.presetId = presetId
  return entry
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const tri = (v: unknown): TriState => (v === 'only' || v === 'exclude' ? v : 'any')
const num = (v: unknown, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : 0

function normalizeMapQuery(raw: unknown): MapQuery {
  const q = emptyMapQuery()
  if (!isObj(raw)) return q
  q.want = strList(raw.want)
  q.avoid = strList(raw.avoid)
  q.wantMode = raw.wantMode === 'all' ? 'all' : 'any'
  if (isObj(raw.thresholds)) {
    for (const k of MAP_LABEL_KEYS) {
      const n = num(raw.thresholds[k], 999)
      if (n > 0) q.thresholds[k] = n
    }
  }
  q.corrupted = tri(raw.corrupted)
  q.unidentified = tri(raw.unidentified)
  return q
}

function normalizeVendorQuery(raw: unknown): VendorQuery {
  const q = emptyVendorQuery()
  if (!isObj(raw)) return q
  q.links = ([0, 3, 4, 5, 6] as const).find((n) => n === raw.links) ?? 0
  q.sixSockets = raw.sixSockets === true
  q.rgb = raw.rgb === true
  q.colorCount = num(raw.colorCount, 6)
  q.color = raw.color === 'r' || raw.color === 'g' || raw.color === 'w' ? raw.color : 'b'
  q.movementSpeed = num(raw.movementSpeed, 99)
  q.quality = num(raw.quality, 30)
  q.plusGemLevel = raw.plusGemLevel === true
  q.gemLevel = num(raw.gemLevel, 40)
  q.mode = raw.mode === 'all' ? 'all' : 'any'
  return q
}

function normalizePrefs(raw: unknown): RegexPrefs {
  const p = defaultRegexPrefs()
  if (!isObj(raw)) return p
  if (raw.gameLang === 'ru' || raw.gameLang === 'en') p.gameLang = raw.gameLang
  if (raw.page === 'vendor' || raw.page === 'library') p.page = raw.page
  p.maps = normalizeMapQuery(raw.maps)
  p.vendor = normalizeVendorQuery(raw.vendor)
  return p
}

/** Один слот — одна строка на игру: при совпадении слот остаётся у первой записи. */
function dedupeSlots(entries: RegexEntry[]): RegexEntry[] {
  const taken = new Set<string>()
  return entries.map((e) => {
    if (!e.slot) return e
    const key = `${e.game}:${e.slot}`
    if (taken.has(key)) {
      const { slot: _drop, ...rest } = e
      void _drop
      return rest
    }
    taken.add(key)
    return e
  })
}

/** Любые данные файла → валидная библиотека (битый файл → пустая). */
export function normalizeLibrary(raw: unknown, newId: () => string): RegexLibrary {
  if (!isObj(raw)) return emptyLibrary()
  const ids = new Set<string>()
  const entries: RegexEntry[] = []
  for (const r of Array.isArray(raw.entries) ? raw.entries : []) {
    const e = sanitizeEntry(r, newId)
    if (!e) continue
    if (ids.has(e.id)) e.id = newId()
    ids.add(e.id)
    entries.push(e)
  }
  return { version: 1, prefs: normalizePrefs(raw.prefs), entries: dedupeSlots(entries) }
}

/** Добавить или изменить запись (слот и пресет сохраняются). */
export function upsertEntry(lib: RegexLibrary, input: RegexEntryInput, newId: () => string): RegexLibrary {
  const existing = input.id ? lib.entries.find((e) => e.id === input.id) : undefined
  const entry = sanitizeEntry({ ...existing, ...input, id: existing?.id ?? newId() }, newId)
  if (!entry) return lib
  const entries = existing
    ? lib.entries.map((e) => (e.id === entry.id ? entry : e))
    : [...lib.entries, entry]
  return { ...lib, entries: dedupeSlots(entries) }
}

export function removeEntry(lib: RegexLibrary, id: string): RegexLibrary {
  return { ...lib, entries: lib.entries.filter((e) => e.id !== id) }
}

/** Назначить слот хоткея (null — снять); у другой записи той же игры слот снимается. */
export function assignSlot(lib: RegexLibrary, id: string, slot: PasteSlot | null): RegexLibrary {
  const target = lib.entries.find((e) => e.id === id)
  if (!target) return lib
  const entries = lib.entries.map((e) => {
    if (e.id === id) {
      const { slot: _old, ...rest } = e
      void _old
      return slot ? { ...rest, slot } : rest
    }
    if (slot && e.game === target.game && e.slot === slot) {
      const { slot: _taken, ...rest } = e
      void _taken
      return rest
    }
    return e
  })
  return { ...lib, entries }
}

/** Текст для хоткея pasteSearch<slot> в игре game (null — слот пуст). */
export function pasteText(lib: RegexLibrary, game: GameId, slot: PasteSlot): string | null {
  return lib.entries.find((e) => e.game === game && e.slot === slot)?.text ?? null
}

/** Файл экспорта: только записи (без настроек страниц). */
export function exportPayload(lib: RegexLibrary): { format: string; version: 1; entries: RegexEntry[] } {
  return { format: LIBRARY_EXPORT_FORMAT, version: 1, entries: lib.entries }
}

/**
 * Импорт: принимает файл экспорта ({format, entries}) или просто массив записей.
 * Дубликаты (та же игра + текст) пропускаются; слоты из файла не переносятся, если заняты.
 * null — файл не похож на библиотеку.
 */
export function importEntries(
  lib: RegexLibrary,
  raw: unknown,
  newId: () => string
): { library: RegexLibrary; added: number } | null {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.entries) ? raw.entries : null
  if (!list) return null
  const have = new Set(lib.entries.map((e) => `${e.game}\n${e.text}`))
  const ids = new Set(lib.entries.map((e) => e.id))
  const added: RegexEntry[] = []
  for (const r of list) {
    const e = sanitizeEntry(r, newId)
    if (!e) continue
    const key = `${e.game}\n${e.text}`
    if (have.has(key)) continue
    have.add(key)
    if (ids.has(e.id)) e.id = newId()
    ids.add(e.id)
    added.push(e)
  }
  return { library: { ...lib, entries: dedupeSlots([...lib.entries, ...added]) }, added: added.length }
}

export function patchPrefs(lib: RegexLibrary, patch: Partial<RegexPrefs>): RegexLibrary {
  return { ...lib, prefs: normalizePrefs({ ...lib.prefs, ...patch }) }
}
