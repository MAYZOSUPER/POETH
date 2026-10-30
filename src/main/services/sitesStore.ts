import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import { isKnownTab, isWebTab, normalizeBookmarks, type SiteBookmark, type SiteTabId } from '@shared/sites'
import { readJson, writeJsonAtomic } from './atomicJson'

// Вкладки сайтов трейд-окна (S43): %APPDATA%/POETH/sites.json — закладки игрока (название и https-адрес),
// последняя вкладка сайта и «заметку о приватности уже видели». Адреса открытых страниц и данные сайтов сюда
// не пишутся (cookies сайтов — в сессии persist:poeth-sites, Partitions\poeth-sites).

export interface SitesData {
  bookmarks: SiteBookmark[]
  lastSite: SiteTabId | null
  noteSeen: boolean
}

let cache: SitesData | null = null
let writing: Promise<void> = Promise.resolve()

function sitesFile(): string {
  return path.join(app.getPath('userData'), 'sites.json')
}

export const newBookmarkId = (): string => randomUUID().slice(0, 8)

/** Данные из файла: закладки повторно проверяются, неизвестная вкладка — забыта. */
export function normalizeSitesData(raw: unknown): SitesData {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const bookmarks = normalizeBookmarks(r.bookmarks)
  const last = r.lastSite
  return {
    bookmarks,
    lastSite: isKnownTab(last, bookmarks) && isWebTab(last) ? last : null,
    noteSeen: r.noteSeen === true
  }
}

export async function getSitesData(): Promise<SitesData> {
  if (!cache) cache = normalizeSitesData(await readJson<unknown>(sitesFile(), null))
  return cache
}

/** Синхронно — то, что уже прочитано (до первого чтения — пусто). */
export function sitesDataNow(): SitesData {
  return cache ?? { bookmarks: [], lastSite: null, noteSeen: false }
}

/** Правка и запись по очереди (без изменений — ничего не пишется). */
export async function updateSitesData(fn: (d: SitesData) => SitesData): Promise<SitesData> {
  const prev = await getSitesData()
  const next = fn(prev)
  if (next === prev) return prev
  cache = next
  writing = writing
    .then(() => writeJsonAtomic(sitesFile(), { v: 1, ...cache }))
    .catch((e) => console.error('[sites] не удалось сохранить sites.json:', e))
  return next
}
