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
// Эскизы хранятся в userData/screen/thumbs-<игра>.bin (deflate) с ключом каталога: при новом каталоге
// пересобираются из кэша иконок, сеть — только для иконок, которых ещё нет в кэше (первый раз — сотни картинок,
// не больше 4 загрузок сразу; прогресс — в оверлей). В сеть уходят только адреса иконок: данных игрока нет.

const PARALLEL = 8

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

const memory = new Map<string, GamePack>()

export interface PackProgress {
  done: number
  total: number
}

/**
 * Эталоны игры: из памяти, с диска или собрать (иконки из кэша S18). null — игра без каталога. onProgress —
 * только когда иконки действительно собираются.
 */
export async function loadGamePack(def: GameDef, onProgress?: (p: PackProgress) => void): Promise<{ pack: GamePack; missing: number } | null> {
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
  const catalog = parseCatalog(items, game, extra)
  const key = createHash('sha256')
    .update(catalog.map((e) => `${e.name}\t${e.icon}`).join('\n'))
    .digest('hex')
    .slice(0, 16)
  const version = `${key}:${createHash('sha256')
    .update((layoutsRaw ?? '') + (digitsRaw ?? ''))
    .digest('hex')
    .slice(0, 8)}`
  const cached = memory.get(game)
  if (cached?.version === version) return { pack: cached, missing: 0 }

  const file = path.join(app.getPath('userData'), 'screen', `thumbs-${game}.bin`)
  let thumbs: IconThumb[] | null = null
  try {
    const buf = await fs.readFile(file)
    const head = buf.subarray(0, 16).toString('latin1')
    // в начале файла — ключ каталога, дальше пакет эскизов (deflate)
    if (head === key) thumbs = decodeThumbs(new Uint8Array(inflateSync(buf.subarray(16))))
  } catch {
    // нет кэша — собрать
  }
  let missing = 0
  if (!thumbs) {
    thumbs = []
    const list: CatalogEntry[] = catalog
    for (let i = 0; i < list.length; i += PARALLEL) {
      const part = await Promise.all(list.slice(i, i + PARALLEL).map(async (e) => ({ e, b: await iconBytes(e.icon).catch(() => null) })))
      for (const { e, b } of part) {
        if (!b) {
          missing++
          continue
        }
        try {
          thumbs.push(makeThumb(decodePng(b), e))
        } catch {
          missing++
        }
      }
      onProgress?.({ done: Math.min(list.length, i + PARALLEL), total: list.length })
    }
    // без части иконок (нет сети) кэш не пишем: в следующий раз докачаются
    if (!missing && thumbs.length) {
      await fs.mkdir(path.dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      await fs.writeFile(tmp, Buffer.concat([Buffer.from(key, 'latin1'), deflateSync(encodeThumbs(thumbs))]))
      await fs.rename(tmp, file)
    }
  }
  const pack: GamePack = { game, version: missing ? `${version}:${thumbs.length}` : version, thumbs: encodeThumbs(thumbs), layouts, digits: parseJson(digitsRaw) }
  if (!missing) memory.set(game, pack)
  return { pack, missing }
}
