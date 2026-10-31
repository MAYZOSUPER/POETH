import { app } from 'electron'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { deflateSync, inflateSync } from 'zlib'
import type { GameDef } from '@shared/games'
import { parseCatalog, type CatalogEntry } from '@shared/screen/catalog'
import { makeThumb, type IconThumb } from '@shared/screen/icons'
import { parseLayoutSet } from '@shared/screen/layout'
import { decodeThumbs, encodeThumbs } from '@shared/screen/thumbs'
import { iconResponse } from '../services/iconCache'
import { resourcesDir } from '../services/questDataset'
import { decodePng } from './png'
import type { GamePack } from './reader'

// Эталоны игры для распознавания окон (S68): каталог стопочных предметов (items.ndjson, английский), их иконки —
// через кэш S18 (web.poecdn.com, сессия без cookies, только этот хост) → эскизы 24×24, раскладки особых вкладок и
// образцы цифр — данными из resources/data/<игра>/screen (или из обновлённого пакета данных в userData/data).
//
// Каталог читается один раз за запуск. Эскизы — в userData/screen/thumbs-<игра>.bin (ключ каталога + deflate),
// в том числе неполные: чего нет в файле, то и недостаёт. Первый раз (эскизов нет совсем) иконки качаются при
// нажатии — не больше 4 сразу, общий предел FIRST_MS, отмена повторным нажатием; недостающие потом докачиваются в
// фоне не чаще раза в REFILL_MS. В сеть уходят только адреса иконок: данных игрока нет.

/** Загрузок иконок сразу (как у кэша S18). */
const PARALLEL = 4
/** Предел первой закачки: дальше распознаём тем, что успело скачаться. */
const FIRST_MS = 90_000
/** Докачка недостающих иконок в фоне — не чаще. */
const REFILL_MS = 6 * 3600_000

function dataDirs(def: GameDef): string[] {
  return [path.join(app.getPath('userData'), 'data', def.dataDir), path.join(resourcesDir(), 'data', def.dataDir)]
}

/** Первый найденный файл данных игры (обновлённый пакет данных важнее встроенного). */
async function readData(def: GameDef, rel: string): Promise<string | null> {
  for (const dir of dataDirs(def)) {
    try {
      return await fs.readFile(path.join(dir, rel), 'utf8')
    } catch {
      // нет в этой папке — следующая
    }
  }
  return null
}

const parseJson = (s: string | null): unknown => {
  if (!s) return null
  try {
    return JSON.parse(s) as unknown
  } catch {
    return null
  }
}

async function iconBytes(url: string): Promise<Uint8Array | null> {
  const res = await iconResponse(url)
  if (res.status !== 200 || res.headers.get('content-type') !== 'image/png') return null
  return new Uint8Array(await res.arrayBuffer())
}

/** Каталог игры на время работы: данные, эскизы и что ещё не скачано. */
interface GameCatalog {
  game: 'poe1' | 'poe2'
  /** ключ каталога (имена и адреса иконок) — первые 16 знаков файла эскизов */
  key: string
  /** версия данных (раскладки, цифры) */
  data: string
  entries: CatalogEntry[]
  layouts: unknown
  digits: unknown
  thumbs: Map<string, IconThumb>
  /** эскизы прочитаны с диска (или их там нет) */
  loaded: boolean
  /** последняя попытка докачки, мс */
  lastFill: number
  filling: Promise<void> | null
  /** пакет для потока — пересобирается, когда меняются эскизы */
  pack: GamePack | null
}

const catalogs = new Map<string, Promise<GameCatalog | null>>()

async function openCatalog(def: GameDef): Promise<GameCatalog | null> {
  const game = def.id === 'poe2' ? 'poe2' : 'poe1'
  const [items, layoutsRaw, digitsRaw] = await Promise.all([
    readData(def, 'en/items.ndjson'),
    readData(def, 'screen/stash-layouts.json'),
    readData(def, 'screen/digits.json')
  ])
  if (!items) return null
  const layouts = parseJson(layoutsRaw)
  const set = parseLayoutSet(layouts)
  const extra = new Set<string>()
  for (const t of set?.tabs ?? []) for (const s of t.slots) for (const n of [s.item, ...(s.alt ?? [])]) if (n) extra.add(n)
  const entries = parseCatalog(items, game, extra)
  const key = createHash('sha256')
    .update(entries.map((e) => `${e.name}\t${e.icon}`).join('\n'))
    .digest('hex')
    .slice(0, 16)
  const data = createHash('sha256')
    .update((layoutsRaw ?? '') + (digitsRaw ?? ''))
    .digest('hex')
    .slice(0, 8)
  return { game, key, data, entries, layouts, digits: parseJson(digitsRaw), thumbs: new Map(), loaded: false, lastFill: 0, filling: null, pack: null }
}

function thumbsFile(game: string): string {
  return path.join(app.getPath('userData'), 'screen', `thumbs-${game}.bin`)
}

async function readThumbs(c: GameCatalog): Promise<void> {
  c.loaded = true
  try {
    const buf = await fs.readFile(thumbsFile(c.game))
    // в начале файла — ключ каталога, дальше пакет эскизов (deflate); другой ключ — каталог сменился
    if (buf.subarray(0, 16).toString('latin1') !== c.key) return
    const names = new Set(c.entries.map((e) => e.name))
    for (const t of decodeThumbs(new Uint8Array(inflateSync(buf.subarray(16)))) ?? []) if (names.has(t.name)) c.thumbs.set(t.name, t)
  } catch {
    // нет файла — эскизов нет
  }
}

async function writeThumbs(c: GameCatalog): Promise<void> {
  if (!c.thumbs.size) return
  const file = thumbsFile(c.game)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, Buffer.concat([Buffer.from(c.key, 'latin1'), deflateSync(encodeThumbs([...c.thumbs.values()]))]))
  await fs.rename(tmp, file)
}

export interface PackProgress {
  done: number
  total: number
}

interface FillOptions {
  onProgress?: (p: PackProgress) => void
  signal?: AbortSignal
  /** предел всей закачки, мс */
  deadline?: number
}

/** Скачать недостающие иконки (по PARALLEL сразу) → эскизы; сохранить то, что вышло. */
async function fill(c: GameCatalog, o: FillOptions): Promise<void> {
  c.lastFill = Date.now()
  const todo = c.entries.filter((e) => !c.thumbs.has(e.name))
  const end = o.deadline ? Date.now() + o.deadline : Infinity
  let added = 0
  let early = false
  for (let i = 0; i < todo.length; i += PARALLEL) {
    if (o.signal?.aborted || Date.now() > end) {
      early = true
      break
    }
    const part = await Promise.all(todo.slice(i, i + PARALLEL).map(async (e) => ({ e, b: await iconBytes(e.icon).catch(() => null) })))
    for (const { e, b } of part) {
      if (!b) continue
      try {
        c.thumbs.set(e.name, makeThumb(decodePng(b), e))
        added++
      } catch {
        // не PNG иконки — пропустить, докачается позже
      }
    }
    o.onProgress?.({ done: Math.min(todo.length, i + PARALLEL), total: todo.length })
  }
  // прервали (отмена, предел) — докачка при следующем нажатии; иначе (не скачались) — не раньше REFILL_MS
  if (early) c.lastFill = 0
  if (added) {
    c.pack = null
    await writeThumbs(c).catch((e: unknown) => console.warn('[screen] thumbs store failed:', e instanceof Error ? e.message : e))
  }
}

export interface LoadedPack {
  pack: GamePack
  /** эскизов в пакете (0 — распознавать нечем) */
  count: number
  /** иконок каталога без эскиза */
  missing: number
}

/**
 * Эталоны игры для потока распознавания. null — игра без каталога. Эскизов нет совсем — качаем сейчас (прогресс,
 * отмена, общий предел); есть, но не все — распознаём тем, что есть, а недостающие докачиваются в фоне не чаще
 * раза в REFILL_MS. Отмена (signal) — бросает AbortError.
 */
export async function loadGamePack(def: GameDef, o: { onProgress?: (p: PackProgress) => void; signal?: AbortSignal } = {}): Promise<LoadedPack | null> {
  let p = catalogs.get(def.id)
  if (!p) {
    p = openCatalog(def).catch(() => null)
    catalogs.set(def.id, p)
  }
  const c = await p
  if (!c) return null
  if (!c.loaded) await readThumbs(c)
  if (!c.thumbs.size) {
    c.filling ??= fill(c, { onProgress: o.onProgress, signal: o.signal, deadline: FIRST_MS }).finally(() => {
      c.filling = null
    })
    await c.filling
    if (o.signal?.aborted) throw new DOMException('aborted', 'AbortError')
  } else if (c.thumbs.size < c.entries.length && !c.filling && Date.now() - c.lastFill >= REFILL_MS) {
    // докачка в фоне: этот снимок распознаётся тем, что есть; новая версия пакета уйдёт в поток при следующем
    c.filling = fill(c, {})
      .catch(() => undefined)
      .finally(() => {
        c.filling = null
      })
  }
  if (!c.pack) {
    c.pack = {
      game: c.game,
      version: `${c.key}:${c.data}:${c.thumbs.size}`,
      thumbs: encodeThumbs([...c.thumbs.values()]),
      layouts: c.layouts,
      digits: c.digits
    }
  }
  return { pack: c.pack, count: c.thumbs.size, missing: c.entries.length - c.thumbs.size }
}
