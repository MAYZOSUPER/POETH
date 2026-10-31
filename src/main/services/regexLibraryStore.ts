import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import type {
  ItemRegexData,
  MapRegexData,
  PasteSlot,
  Poe2ProfileInput,
  Poe2RegexData,
  Poe2RegexPrefs,
  Poe2RegexState,
  RegexEntryInput,
  RegexLang,
  RegexLibrary,
  RegexPrefs
} from '@shared/types'
import {
  assignSlot,
  importEntries,
  legacyGameLang,
  normalizeLibrary,
  pasteText,
  patchPrefs,
  removeEntry,
  upsertEntry
} from '@shared/regex/library'
import { normalizePoe2State, patchPoe2Prefs, removeProfile, upsertProfile } from '@shared/regex/poe2/profiles'
import { getRunningGame } from '../gameContext'
import { readJson, writeJsonAtomic } from './atomicJson'
import { resourcesDir } from './questDataset'

// Библиотека regex-строк (%APPDATA%/POETH/regex-library.json, атомарная запись) и данные
// карт и предметов (S46) для движка. Логика правок — чистые функции @shared/regex/library.

let cache: RegexLibrary | null = null
let writing: Promise<void> = Promise.resolve()
/** prefs.gameLang из файла до S26 — ждёт переноса в Settings.gameLang (ipc/gameLang.ts) */
let legacyLang: RegexLang | null = null

function libraryFile(): string {
  return path.join(app.getPath('userData'), 'regex-library.json')
}

const newId = (): string => randomUUID()

export async function getLibrary(): Promise<RegexLibrary> {
  if (!cache) {
    const raw = await readJson<unknown>(libraryFile(), null)
    legacyLang = legacyGameLang(raw)
    cache = normalizeLibrary(raw, newId)
  }
  return cache
}

/** Язык клиента игры из файла до S26 (prefs.gameLang); null — его нет или уже перенесён. */
export async function getLegacyGameLang(): Promise<RegexLang | null> {
  await getLibrary()
  return legacyLang
}

/** Старое значение перенесено в общую настройку — переписать файл без него (перенос — один раз). */
export async function dropLegacyGameLang(): Promise<void> {
  if (!legacyLang) return
  legacyLang = null
  commit(await getLibrary())
}

/** Запомнить и записать (записи идут по очереди — частые правки настроек не гоняются). */
function commit(next: RegexLibrary): RegexLibrary {
  cache = next
  writing = writing
    .then(() => writeJsonAtomic(libraryFile(), cache))
    .catch((e) => console.error('[regex] не удалось сохранить библиотеку:', e))
  return next
}

export async function saveEntry(input: RegexEntryInput): Promise<RegexLibrary> {
  return commit(upsertEntry(await getLibrary(), input, newId))
}

export async function deleteEntry(id: string): Promise<RegexLibrary> {
  return commit(removeEntry(await getLibrary(), id))
}

export async function setSlot(id: string, slot: PasteSlot | null): Promise<RegexLibrary> {
  return commit(assignSlot(await getLibrary(), id, slot))
}

export async function setPrefs(patch: Partial<RegexPrefs>): Promise<RegexLibrary> {
  return commit(patchPrefs(await getLibrary(), patch))
}

/** Импорт из разобранного файла; null — файл не похож на библиотеку. */
export async function importLibraryData(raw: unknown): Promise<{ library: RegexLibrary; added: number } | null> {
  const res = importEntries(await getLibrary(), raw, newId)
  if (!res) return null
  commit(res.library)
  return res
}

/**
 * Строка для хоткея pasteSearch<slot> запущенной игры (null — слот пуст).
 * Подключается к stashSearch() из S1: Ctrl+F → вставить строку в поле поиска.
 */
export async function getPasteString(slot: PasteSlot): Promise<string | null> {
  return pasteText(await getLibrary(), getRunningGame(), slot)
}

// ---------------------------------------------------------------------------
// Данные карт (resources/data/poe1/regex/maps.<lang>.json)
// ---------------------------------------------------------------------------

const mapCache = new Map<RegexLang, MapRegexData>()

function isMapData(v: unknown): v is MapRegexData {
  const d = v as MapRegexData | null
  return !!d && Array.isArray(d.mods) && Array.isArray(d.extra) && !!d.labels && !!d.flags && !!d.meta
}

/** Сначала userData/data (обновление данных без переустановки), затем bundled resources. */
export async function loadMapData(lang: RegexLang): Promise<MapRegexData | null> {
  const hit = mapCache.get(lang)
  if (hit) return hit
  const rel = path.join('data', 'poe1', 'regex', `maps.${lang}.json`)
  for (const file of [path.join(app.getPath('userData'), rel), path.join(resourcesDir(), rel)]) {
    const data = await readJson<unknown>(file, null)
    if (isMapData(data)) {
      mapCache.set(lang, data)
      return data
    }
  }
  console.error(`[regex] нет данных карт для ${lang}`)
  return null
}

// ---------------------------------------------------------------------------
// Данные «Предметов» (resources/data/poe1/regex/items.<lang>.json, S46)
// ---------------------------------------------------------------------------

const itemCache = new Map<RegexLang, ItemRegexData>()

function isItemData(v: unknown): v is ItemRegexData {
  const d = v as ItemRegexData | null
  return (
    !!d &&
    Array.isArray(d.mods) &&
    Array.isArray(d.bases) &&
    !!d.classes &&
    !!d.rarity &&
    !!d.influence &&
    !!d.flags &&
    typeof d.itemLevel === 'string' &&
    !!d.meta
  )
}

/** Как данные карт: сначала userData/data (обновление без переустановки), затем bundled resources. */
export async function loadItemData(lang: RegexLang): Promise<ItemRegexData | null> {
  const hit = itemCache.get(lang)
  if (hit) return hit
  const rel = path.join('data', 'poe1', 'regex', `items.${lang}.json`)
  for (const file of [path.join(app.getPath('userData'), rel), path.join(resourcesDir(), rel)]) {
    const data = await readJson<unknown>(file, null)
    if (isItemData(data)) {
      itemCache.set(lang, data)
      return data
    }
  }
  console.error(`[regex] нет данных предметов для ${lang}`)
  return null
}

// ---------------------------------------------------------------------------
// PoE 2 (S62): настройки страниц и профили — отдельный файл %APPDATA%/POETH/regex-poe2.json (строки библиотеки —
// общие, с game 'poe2'); данные — resources/data/poe2/regex/regex.<lang>.json
// ---------------------------------------------------------------------------

let poe2Cache: Poe2RegexState | null = null
let poe2Writing: Promise<void> = Promise.resolve()

function poe2File(): string {
  return path.join(app.getPath('userData'), 'regex-poe2.json')
}

export async function getPoe2State(): Promise<Poe2RegexState> {
  if (!poe2Cache) poe2Cache = normalizePoe2State(await readJson<unknown>(poe2File(), null), newId)
  return poe2Cache
}

function commitPoe2(next: Poe2RegexState): Poe2RegexState {
  poe2Cache = next
  poe2Writing = poe2Writing
    .then(() => writeJsonAtomic(poe2File(), poe2Cache))
    .catch((e) => console.error('[regex] не удалось сохранить настройки PoE 2:', e))
  return next
}

export async function setPoe2Prefs(patch: Partial<Poe2RegexPrefs>): Promise<Poe2RegexState> {
  return commitPoe2(patchPoe2Prefs(await getPoe2State(), patch))
}

export async function savePoe2Profile(input: Poe2ProfileInput): Promise<Poe2RegexState> {
  return commitPoe2(upsertProfile(await getPoe2State(), input, newId))
}

export async function deletePoe2Profile(id: string): Promise<Poe2RegexState> {
  return commitPoe2(removeProfile(await getPoe2State(), id))
}

const poe2DataCache = new Map<RegexLang, Poe2RegexData>()

function isPoe2Data(v: unknown): v is Poe2RegexData {
  const d = v as Poe2RegexData | null
  return (
    !!d &&
    !!d.meta &&
    !!d.waystone &&
    Array.isArray(d.waystone.mods) &&
    !!d.tablet &&
    Array.isArray(d.tablet.mods) &&
    !!d.vendor &&
    !!d.vendor.props
  )
}

/** Как данные карт PoE 1: сначала userData/data (обновление без переустановки), затем bundled resources. */
export async function loadPoe2Data(lang: RegexLang): Promise<Poe2RegexData | null> {
  const hit = poe2DataCache.get(lang)
  if (hit) return hit
  const rel = path.join('data', 'poe2', 'regex', `regex.${lang}.json`)
  for (const file of [path.join(app.getPath('userData'), rel), path.join(resourcesDir(), rel)]) {
    const data = await readJson<unknown>(file, null)
    if (isPoe2Data(data)) {
      poe2DataCache.set(lang, data)
      return data
    }
  }
  console.error(`[regex] нет данных PoE 2 для ${lang}`)
  return null
}
