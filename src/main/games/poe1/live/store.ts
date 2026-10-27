import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import type { LiveOptions } from '@shared/types'
import { readJson, writeJsonAtomic } from '../../../services/atomicJson'

// Список live-поисков и опции вкладки Live — userData/live.json (S6). Секретов здесь нет:
// только код поиска на сайте, лига и флаги. Поиски из избранного трейд-окна (S5) приходят
// через syncFavorites() в liveSearch.ts и помечены source:'favorite'.

export interface StoredSearch {
  id: string
  title: string
  league: string
  slug: string
  enabled: boolean
  sound: boolean
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

export const DEFAULT_OPTIONS: LiveOptions = { enabled: true, sound: true, notifyWindows: true }
const MAX_STORED = 100
const MAX_TITLE = 80

function file(): string {
  return path.join(app.getPath('userData'), 'live.json')
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def
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
    notifyWindows: bool(o.notifyWindows, DEFAULT_OPTIONS.notifyWindows)
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
      title: cleanTitle(s.title, s.slug),
      league: s.league.slice(0, 80),
      slug: s.slug.slice(0, 64),
      enabled: bool(s.enabled, false),
      sound: bool(s.sound, true),
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
