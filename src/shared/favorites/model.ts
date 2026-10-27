// Избранное: нормализация файла и правки (папки, поиски, перенос, порядок, архив, импорт BT).
// Чистые функции — их зовёт main (favoritesStore) и тесты. Все правки возвращают новый FavData.

import type { GameId, TradeSiteKind } from '../games'
import type { FavData, FavFolder, FavFolderInput, FavSearch, FavSearchInput } from '../types/fav'
import { exportBtFolder, importBtFolder, splitBtStrings } from './betterTrading'

export const TITLE_MAX = 120
export const NOTES_MAX = 2000

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const isGame = (v: unknown): v is GameId => v === 'poe1' || v === 'poe2'
const isKind = (v: unknown): v is TradeSiteKind => v === 'search' || v === 'exchange'
const SLUG_RE = /^[A-Za-z0-9]+$/

export function emptyFavorites(): FavData {
  return { version: 1, folders: [], searches: [] }
}

function cleanTitle(v: unknown): string {
  return (str(v) ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX)
}

function sanitizeFolder(raw: unknown): FavFolder | null {
  if (!isObj(raw)) return null
  const id = str(raw.id)
  const title = cleanTitle(raw.title)
  if (!id || !title || !isGame(raw.game)) return null
  const f: FavFolder = { id, title, game: raw.game, order: typeof raw.order === 'number' ? raw.order : 0 }
  const icon = str(raw.icon)
  if (icon) f.icon = icon.slice(0, 120)
  if (typeof raw.archivedAt === 'number') f.archivedAt = raw.archivedAt
  return f
}

function sanitizeSearch(raw: unknown): FavSearch | null {
  if (!isObj(raw)) return null
  const id = str(raw.id)
  const folderId = str(raw.folderId)
  const title = cleanTitle(raw.title)
  const slug = str(raw.slug)
  if (!id || !folderId || !title || !slug || !SLUG_RE.test(slug) || !isGame(raw.game) || !isKind(raw.type)) {
    return null
  }
  const s: FavSearch = {
    id,
    folderId,
    title,
    game: raw.game,
    type: raw.type,
    slug,
    order: typeof raw.order === 'number' ? raw.order : 0
  }
  const league = str(raw.league)?.trim()
  if (league) s.league = league.slice(0, 120)
  const notes = str(raw.notes)?.trim()
  if (notes) s.notes = notes.slice(0, NOTES_MAX)
  if (typeof raw.archivedAt === 'number') s.archivedAt = raw.archivedAt
  if (isObj(raw.live)) s.live = { enabled: raw.live.enabled === true, notify: raw.live.notify !== false }
  return s
}

/** Порядок 0… по текущей сортировке (папки — внутри игры, поиски — внутри папки). */
function renumber(data: FavData): FavData {
  const folders = [...data.folders].sort((a, b) => a.order - b.order)
  const fCount = new Map<GameId, number>()
  const nextFolders = folders.map((f) => {
    const n = fCount.get(f.game) ?? 0
    fCount.set(f.game, n + 1)
    return f.order === n ? f : { ...f, order: n }
  })
  const searches = [...data.searches].sort((a, b) => a.order - b.order)
  const sCount = new Map<string, number>()
  const nextSearches = searches.map((s) => {
    const n = sCount.get(s.folderId) ?? 0
    sCount.set(s.folderId, n + 1)
    return s.order === n ? s : { ...s, order: n }
  })
  return { version: 1, folders: nextFolders, searches: nextSearches }
}

/** Любые данные файла → валидное избранное (битые записи отбрасываются, сироты — в папку). */
export function normalizeFavorites(raw: unknown, newId: () => string): FavData {
  if (!isObj(raw)) return emptyFavorites()
  const folderIds = new Set<string>()
  const folders: FavFolder[] = []
  for (const r of Array.isArray(raw.folders) ? raw.folders : []) {
    const f = sanitizeFolder(r)
    if (!f || folderIds.has(f.id)) continue
    folderIds.add(f.id)
    folders.push(f)
  }
  const searchIds = new Set<string>()
  let data: FavData = { version: 1, folders, searches: [] }
  for (const r of Array.isArray(raw.searches) ? raw.searches : []) {
    const s = sanitizeSearch(r)
    if (!s) continue
    if (searchIds.has(s.id)) s.id = newId()
    searchIds.add(s.id)
    if (!folderIds.has(s.folderId)) {
      const target = ensureUnsorted(data, s.game, newId)
      data = target.data
      s.folderId = target.folderId
      folderIds.add(target.folderId)
    }
    data = { ...data, searches: [...data.searches, s] }
  }
  return renumber(data)
}

/** Следующий порядковый номер папки игры (после всех существующих). */
function nextFolderOrder(data: FavData, game: GameId): number {
  return data.folders.filter((f) => f.game === game).reduce((n, f) => Math.max(n, f.order + 1), 0)
}

/** Папка «Без папки» игры (создаётся при первом поиске без папки). */
export const UNSORTED_TITLE = '—'

function ensureUnsorted(data: FavData, game: GameId, newId: () => string): { data: FavData; folderId: string } {
  const found = data.folders.find((f) => f.game === game && f.title === UNSORTED_TITLE && !f.archivedAt)
  if (found) return { data, folderId: found.id }
  const folder: FavFolder = { id: newId(), title: UNSORTED_TITLE, game, order: nextFolderOrder(data, game) }
  return { data: { ...data, folders: [...data.folders, folder] }, folderId: folder.id }
}

// ---------------------------------------------------------------------------
// Папки
// ---------------------------------------------------------------------------

export function saveFolder(data: FavData, input: FavFolderInput, newId: () => string): { data: FavData; id: string } {
  const title = cleanTitle(input.title)
  if (!title) return { data, id: input.id ?? '' }
  const existing = input.id ? data.folders.find((f) => f.id === input.id) : undefined
  if (existing) {
    const next = { ...existing, title }
    if (input.icon !== undefined) next.icon = input.icon || undefined
    return { data: { ...data, folders: data.folders.map((f) => (f.id === existing.id ? next : f)) }, id: existing.id }
  }
  const folder: FavFolder = {
    id: newId(),
    title,
    game: input.game,
    order: nextFolderOrder(data, input.game)
  }
  if (input.icon) folder.icon = input.icon
  return { data: { ...data, folders: [...data.folders, folder] }, id: folder.id }
}

/** Удалить папку вместе с её поисками. */
export function deleteFolder(data: FavData, id: string): FavData {
  return renumber({
    version: 1,
    folders: data.folders.filter((f) => f.id !== id),
    searches: data.searches.filter((s) => s.folderId !== id)
  })
}

export function archiveFolder(data: FavData, id: string, archived: boolean, now = Date.now()): FavData {
  return {
    ...data,
    folders: data.folders.map((f) => {
      if (f.id !== id) return f
      if (archived) return { ...f, archivedAt: now }
      const { archivedAt: _a, ...rest } = f
      void _a
      return rest
    })
  }
}

/** Новый порядок папок игры (ids — по порядку; не указанные остаются в конце). */
export function reorderFolders(data: FavData, game: GameId, ids: string[]): FavData {
  const rank = new Map(ids.map((id, i) => [id, i]))
  const folders = data.folders.map((f) =>
    f.game === game ? { ...f, order: rank.has(f.id) ? (rank.get(f.id) as number) : ids.length + f.order } : f
  )
  return renumber({ ...data, folders })
}

// ---------------------------------------------------------------------------
// Поиски
// ---------------------------------------------------------------------------

/**
 * Добавить или изменить поиск. Новый поиск с тем же game+type+slug в той же папке не
 * дублируется — обновляется название/лига.
 */
export function saveSearch(
  data: FavData,
  input: FavSearchInput,
  newId: () => string
): { data: FavData; search: FavSearch | null } {
  const title = cleanTitle(input.title)
  if (!title || !SLUG_RE.test(input.slug) || !isKind(input.type)) return { data, search: null }
  const existing = input.id ? data.searches.find((s) => s.id === input.id) : undefined
  const game: GameId = input.game ?? existing?.game ?? 'poe1'
  let next = data
  let folderId = input.folderId ?? existing?.folderId
  if (!folderId || !next.folders.some((f) => f.id === folderId)) {
    const target = ensureUnsorted(next, game, newId)
    next = target.data
    folderId = target.folderId
  }
  const same =
    existing ??
    next.searches.find((s) => s.folderId === folderId && s.game === game && s.type === input.type && s.slug === input.slug)
  const base: FavSearch = same ?? {
    id: newId(),
    folderId,
    title,
    game,
    type: input.type,
    slug: input.slug,
    order: next.searches.filter((s) => s.folderId === folderId).length
  }
  const search: FavSearch = { ...base, title, type: input.type, slug: input.slug, game }
  if (base.folderId !== folderId) {
    search.folderId = folderId
    search.order = next.searches.filter((s) => s.folderId === folderId).length
  }
  const league = input.league?.trim()
  if (league) search.league = league
  else delete search.league
  const notes = input.notes?.trim()
  if (notes) search.notes = notes.slice(0, NOTES_MAX)
  else if (input.notes !== undefined) delete search.notes
  const searches = same ? next.searches.map((s) => (s.id === same.id ? search : s)) : [...next.searches, search]
  return { data: renumber({ ...next, searches }), search }
}

export function deleteSearch(data: FavData, id: string): FavData {
  return renumber({ ...data, searches: data.searches.filter((s) => s.id !== id) })
}

export function archiveSearch(data: FavData, id: string, archived: boolean, now = Date.now()): FavData {
  return {
    ...data,
    searches: data.searches.map((s) => {
      if (s.id !== id) return s
      if (archived) return { ...s, archivedAt: now, live: s.live ? { ...s.live, enabled: false } : undefined }
      const { archivedAt: _a, ...rest } = s
      void _a
      return rest
    })
  }
}

/** Перенести поиск в папку на позицию index (по умолчанию — в конец). */
export function moveSearch(data: FavData, id: string, folderId: string, index?: number): FavData {
  const s = data.searches.find((x) => x.id === id)
  const folder = data.folders.find((f) => f.id === folderId)
  if (!s || !folder) return data
  const siblings = data.searches
    .filter((x) => x.folderId === folderId && x.id !== id)
    .sort((a, b) => a.order - b.order)
  const at = index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length))
  siblings.splice(at, 0, { ...s, folderId, game: folder.game })
  const order = new Map(siblings.map((x, i) => [x.id, i]))
  const searches = data.searches.map((x) =>
    order.has(x.id) ? { ...(x.id === id ? { ...s, folderId, game: folder.game } : x), order: order.get(x.id) as number } : x
  )
  return renumber({ ...data, searches })
}

export function setLiveFlags(data: FavData, id: string, patch: { enabled?: boolean; notify?: boolean }): FavData {
  return {
    ...data,
    searches: data.searches.map((s) => {
      if (s.id !== id) return s
      const live = { enabled: s.live?.enabled ?? false, notify: s.live?.notify ?? true, ...patch }
      return { ...s, live }
    })
  }
}

/** Поиски папки по порядку. */
export function folderSearches(data: FavData, folderId: string): FavSearch[] {
  return data.searches.filter((s) => s.folderId === folderId).sort((a, b) => a.order - b.order)
}

// ---------------------------------------------------------------------------
// Better Trading
// ---------------------------------------------------------------------------

/** Папка → строка "3:…" (архивные поиски не выгружаются). */
export function exportFolderBt(data: FavData, folderId: string): string | null {
  const folder = data.folders.find((f) => f.id === folderId)
  if (!folder) return null
  return exportBtFolder(
    folder,
    folderSearches(data, folderId).filter((s) => !s.archivedAt)
  )
}

/** Все активные папки игры — по строке на папку. */
export function exportAllBt(data: FavData, game: GameId): string {
  return data.folders
    .filter((f) => f.game === game && !f.archivedAt)
    .sort((a, b) => a.order - b.order)
    .map((f) => exportFolderBt(data, f.id))
    .filter((s): s is string => !!s)
    .join('\n')
}

/**
 * Импорт строк Better Trading: каждая строка — новая папка. Поиски, которые уже есть в
 * избранном той же игры (тот же type+slug), не дублируются.
 */
export function importBt(
  data: FavData,
  text: string,
  newId: () => string
): { data: FavData; folders: number; searches: number; invalid: number } {
  let next = data
  let folders = 0
  let searches = 0
  let invalid = 0
  const known = new Set(data.searches.map((s) => `${s.game}:${s.type}:${s.slug}`))
  for (const str of splitBtStrings(text)) {
    const bt = importBtFolder(str)
    if (!bt) {
      invalid++
      continue
    }
    const fresh = bt.searches.filter((s) => !known.has(`${s.game}:${s.type}:${s.slug}`))
    if (!fresh.length) continue
    const f = saveFolder(next, { title: bt.title, game: bt.game, icon: bt.icon }, newId)
    next = f.data
    folders++
    for (const s of fresh) {
      known.add(`${s.game}:${s.type}:${s.slug}`)
      const r = saveSearch(next, { folderId: f.id, title: s.title, game: s.game, type: s.type, slug: s.slug }, newId)
      next = r.data
      if (r.search) searches++
    }
  }
  return { data: next, folders, searches, invalid }
}
