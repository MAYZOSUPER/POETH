import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'
import type { FavData } from '@shared/types'
import { normalizeFavorites } from '@shared/favorites/model'
import { readJson, writeJsonAtomic } from './atomicJson'

// Избранные поиски трейда (%APPDATA%/POETH/favorites.json, атомарная запись по очереди).
// Логика правок — чистые функции @shared/favorites/model; здесь только кэш, запись и подписка.

let cache: FavData | null = null
let writing: Promise<void> = Promise.resolve()
const listeners = new Set<(d: FavData) => void>()

function favFile(): string {
  return path.join(app.getPath('userData'), 'favorites.json')
}

export const newFavId = (): string => randomUUID()

export async function getFavorites(): Promise<FavData> {
  if (!cache) cache = normalizeFavorites(await readJson<unknown>(favFile(), null), newFavId)
  return cache
}

/** Применить правку, записать и уведомить подписчиков (без изменений — ничего не пишется). */
export async function updateFavorites(fn: (d: FavData) => FavData): Promise<FavData> {
  const prev = await getFavorites()
  const next = fn(prev)
  if (next === prev) return prev
  cache = next
  writing = writing
    .then(() => writeJsonAtomic(favFile(), cache))
    .catch((e) => console.error('[fav] не удалось сохранить избранное:', e))
  for (const cb of listeners) cb(next)
  return next
}

export function onFavoritesChanged(cb: (d: FavData) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
