import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import type { GameId } from '@shared/games'
import { SLUG_MAX } from '@shared/favorites/slug'
import type { LiveOptions } from '@shared/types'
import { readJson, writeJsonAtomic } from '../../../services/atomicJson'

// Список live-поисков и опции вкладки Live — userData/live.json (S6). Секретов здесь нет:
// только код поиска на сайте, лига и флаги. Поиски из избранного трейд-окна (S5) приходят
// через адаптер FavLiveAdapter (liveSearch.ts → setFavoriteLive) и помечены source:'favorite'.
// S63: у поиска есть игра (game; в файлах до S63 поля нет — это PoE1), работают поиски запущенной игры.

export interface StoredSearch {
  id: string
  /** игра поиска: PoE1 — /trade, PoE2 — /trade2 */
  game: GameId
  title: string
  league: string
  slug: string
  enabled: boolean
  sound: boolean
  /** тост, звук и уведомление о находках (у поисков избранного — флаг «уведомлять» S5) */
  notify: boolean
  source: 'manual' | 'favorite'
  /** id в избранном трейд-окна (source:'favorite') */
  favId?: string
  createdAt: number
}

interface LiveFile {
  version: 1
  options: LiveOptions
  searches: StoredSearch[]
}

/** Безопасный предел live-поисков PoE2 по умолчанию (предел соединений trade2 сайт не сообщает). */
export const POE2_MAX_DEFAULT = 5
export const POE2_MAX_LIMIT = 20

export const DEFAULT_OPTIONS: LiveOptions = { enabled: true, sound: true, notifyWindows: true, poe2Max: POE2_MAX_DEFAULT }
const MAX_STORED = 100
const MAX_TITLE = 80

function file(): string {
  return path.join(app.getPath('userData'), 'live.json')
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def
}

/** Предел поисков PoE2: целое 1..20, мусор — значение по умолчанию. */
export function clampPoe2Max(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= POE2_MAX_LIMIT ? v : POE2_MAX_DEFAULT
}

export function cleanTitle(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : ''
  return s || fallback
}

function normalize(raw: unknown): LiveFile {
  const src = (raw ?? {}) as Partial<LiveFile>
  const o = (src.options ?? {}) as Partial<LiveOptions>
  const options: LiveOptions = {
    enabled: bool(o.enabled, DEFAULT_OPTIONS.enabled),
    sound: bool(o.sound, DEFAULT_OPTIONS.sound),
    notifyWindows: bool(o.notifyWindows, DEFAULT_OPTIONS.notifyWindows),
    poe2Max: clampPoe2Max(o.poe2Max)
  }
  const searches: StoredSearch[] = []
  const seen = new Set<string>()
  for (const s of Array.isArray(src.searches) ? src.searches : []) {
    if (!s || typeof s.slug !== 'string' || typeof s.league !== 'string' || !s.slug || !s.league) continue
    const id = typeof s.id === 'string' && s.id ? s.id : randomUUID()
    if (seen.has(id)) continue
    seen.add(id)
    searches.push({
      id,
      game: s.game === 'poe2' ? 'poe2' : 'poe1',
      title: cleanTitle(s.title, s.slug),
      league: s.league.slice(0, 80),
      slug: s.slug.slice(0, SLUG_MAX),
      enabled: bool(s.enabled, false),
      sound: bool(s.sound, true),
      notify: bool(s.notify, true),
      source: s.source === 'favorite' ? 'favorite' : 'manual',
      ...(typeof s.favId === 'string' ? { favId: s.favId } : {}),
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now()
    })
    if (searches.length >= MAX_STORED) break
  }
  return { version: 1, options, searches }
}

export async function loadLiveFile(): Promise<LiveFile> {
  return normalize(await readJson<unknown>(file(), {}))
}

let writing: Promise<void> = Promise.resolve()

/** Сохранить (записи идут по очереди — один файл, один писатель). */
export function saveLiveFile(data: { options: LiveOptions; searches: StoredSearch[] }): Promise<void> {
  const payload: LiveFile = { version: 1, options: data.options, searches: data.searches.slice(0, MAX_STORED) }
  writing = writing.then(
    () => writeJsonAtomic(file(), payload),
    () => writeJsonAtomic(file(), payload)
  )
  return writing.catch(() => undefined)
}

export function newSearchId(): string {
  return randomUUID()
}

export { MAX_STORED }
