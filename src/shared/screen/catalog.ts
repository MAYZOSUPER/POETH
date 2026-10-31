// Каталог предметов для распознавания окон (S68, чистый модуль): из items.ndjson игры (APT / EE2, английский) —
// стопочные предметы особых вкладок тайника с адресом иконки на web.poecdn.com. Ключ предмета — английское имя
// (как в фиде цен и раскладках), ключ рисунка — путь 2DItems/… из адреса иконки: у валюты PoE 2 разных уровней
// (Greater / Perfect) рисунок один, и различает их только место в вкладке.

import type { IconRef } from './icons'

export interface CatalogEntry extends IconRef {
  /** https://web.poecdn.com/gen/image/… */
  icon: string
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** base64 / base64url без паддинга → строка (только латиница и JSON из адреса иконки). */
function b64(s: string): string {
  let bits = 0
  let acc = 0
  let out = ''
  for (const ch of s.replace(/-/g, '+').replace(/_/g, '/')) {
    const v = B64.indexOf(ch)
    if (v < 0) break
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += String.fromCharCode((acc >> bits) & 255)
    }
  }
  return out
}

/** Ключ рисунка из адреса иконки: поле f из …/gen/image/<base64 JSON>/…; иначе — имя файла. */
export function artKey(url: string): string {
  const m = /\/gen\/image\/([^/]+)\//.exec(url)
  if (m) {
    try {
      const j = JSON.parse(b64(m[1])) as unknown
      const f = Array.isArray(j) ? (j[2] as { f?: unknown } | undefined)?.f : undefined
      if (typeof f === 'string' && f) return f
    } catch {
      // не JSON — ниже имя файла
    }
  }
  return url.split('?')[0].split('/').pop() ?? url
}

interface RawItem {
  name?: unknown
  refName?: unknown
  namespace?: unknown
  icon?: unknown
  exchangeable?: unknown
  tradeTag?: unknown
  w?: unknown
  h?: unknown
}

/** Какие предметы годятся в каталог: PoE 1 — торгуемые на обменнике, PoE 2 — с тегом обмена. */
export function isStackable(game: 'poe1' | 'poe2', j: RawItem): boolean {
  if (j.namespace !== 'ITEM' || typeof j.icon !== 'string' || !j.icon) return false
  return game === 'poe1' ? j.exchangeable === true : typeof j.tradeTag === 'string' && !!j.tradeTag
}

/**
 * items.ndjson (английский) → каталог. extra — имена, которые нужны сверх фильтра (предметы раскладок).
 * Повторы имён — первая запись.
 */
export function parseCatalog(ndjson: string, game: 'poe1' | 'poe2', extra: ReadonlySet<string> = new Set()): CatalogEntry[] {
  const out: CatalogEntry[] = []
  const seen = new Set<string>()
  for (const line of ndjson.split('\n')) {
    if (!line.trim()) continue
    let j: RawItem
    try {
      j = JSON.parse(line) as RawItem
    } catch {
      continue
    }
    const name = typeof j.refName === 'string' && j.refName ? j.refName : typeof j.name === 'string' ? j.name : ''
    if (!name || seen.has(name)) continue
    if (!isStackable(game, j) && !(extra.has(name) && j.namespace === 'ITEM' && typeof j.icon === 'string' && j.icon)) continue
    seen.add(name)
    const icon = j.icon as string
    const w = typeof j.w === 'number' && j.w > 0 ? j.w : 1
    const h = typeof j.h === 'number' && j.h > 0 ? j.h : 1
    out.push({ name, art: artKey(icon), w, h, icon })
  }
  return out
}
