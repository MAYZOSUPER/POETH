// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/assets/make-index-files.mjs @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: TS, построение в памяти (фолбэк, если *.index.bin не подходит к ndjson), поиск
// диапазона одинаковых хэшей (коллизии и одинаковые локализованные имена не теряются).
//
// Индекс — Uint32Array пар [fnv1a32(ключ), смещение начала строки в ndjson], отсортированных по хэшу.
// Смещение — индекс в JS-строке (UTF-16), загрузчик режет `ndjson.slice(start, end)`.

import { fnv1a32 } from './fnv1a'
import type { BaseType, StatOrGroup } from './interfaces'

export const INDEX_WIDTH = 2

function pack(rows: Array<{ hash: number; start: number }>): Uint32Array {
  rows.sort((a, b) => a.hash - b.hash || a.start - b.start)
  const data = new Uint32Array(rows.length * INDEX_WIDTH)
  rows.forEach((r, k) => {
    data[k * INDEX_WIDTH] = r.hash
    data[k * INDEX_WIDTH + 1] = r.start
  })
  return data
}

function* ndjsonLines(ndjson: string): Generator<{ start: number; line: string }> {
  let start = 0
  while (start < ndjson.length) {
    let end = ndjson.indexOf('\n', start)
    if (end === -1) end = ndjson.length
    if (end > start) yield { start, line: ndjson.slice(start, end) }
    start = end + 1
  }
}

export function buildStatsIndexes(ndjson: string): { byRef: Uint32Array; byMatcher: Uint32Array } {
  const byRef: Array<{ hash: number; start: number }> = []
  const byMatcher: Array<{ hash: number; start: number }> = []
  for (const { start, line } of ndjsonLines(ndjson)) {
    const statOrGroup = JSON.parse(line) as StatOrGroup
    const stats = 'stats' in statOrGroup ? statOrGroup.stats : [statOrGroup]
    for (const stat of stats) {
      byRef.push({ start, hash: fnv1a32(stat.ref) })
      // POETH: и string, и advanced (APT — только advanced): обычный формат и текст с трейда — string-вариант
      for (const m of stat.matchers) {
        byMatcher.push({ start, hash: fnv1a32(m.string) })
        if (m.advanced && m.advanced !== m.string) byMatcher.push({ start, hash: fnv1a32(m.advanced) })
      }
    }
  }
  return { byRef: pack(byRef), byMatcher: pack(byMatcher) }
}

export function buildItemsIndexes(ndjson: string): { byName: Uint32Array; byRefName: Uint32Array } {
  const startsByKey = new Map<string, { hashName: number; hashRefName: number; start: number }>()
  for (const { start, line } of ndjsonLines(ndjson)) {
    const item = JSON.parse(line) as BaseType
    const key = `${item.namespace}::${item.refName}`
    if (!startsByKey.has(key)) {
      startsByKey.set(key, {
        hashName: fnv1a32(`${item.namespace}::${item.name}`),
        hashRefName: fnv1a32(key),
        start
      })
    }
  }
  const rows = Array.from(startsByKey.values())
  return {
    byName: pack(rows.map((r) => ({ hash: r.hashName, start: r.start }))),
    byRefName: pack(rows.map((r) => ({ hash: r.hashRefName, start: r.start })))
  }
}

/** Все смещения строк с данным хэшем (обычно одно; больше — коллизия или одинаковые ключи). */
export function lookupStarts(index: Uint32Array, hash: number): number[] {
  const rows = index.length / INDEX_WIDTH
  let lo = 0
  let hi = rows
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (index[mid * INDEX_WIDTH] < hash) lo = mid + 1
    else hi = mid
  }
  const out: number[] = []
  for (let k = lo; k < rows && index[k * INDEX_WIDTH] === hash; k++) {
    out.push(index[k * INDEX_WIDTH + 1])
  }
  return out
}

/** Индекс подходит к ndjson, если все смещения указывают на начала строк (иначе — CRLF/другая версия). */
export function indexMatchesNdjson(index: Uint32Array, ndjson: string): boolean {
  if (index.length % INDEX_WIDTH !== 0) return false
  for (let k = 0; k < index.length; k += INDEX_WIDTH) {
    const start = index[k + 1]
    if (start >= ndjson.length || (start !== 0 && ndjson[start - 1] !== '\n') || ndjson[start] !== '{') return false
  }
  return true
}
