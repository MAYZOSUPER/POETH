// Жадное покрытие выбранных модов общими подстроками.
//
// У каждого мода есть заранее найденный уникальный токен (генератор). Если выбрано несколько
// модов, часто короче одна общая подстрока («monster life» в двух модах) — ищем такие подстроки
// среди строк выбранных модов, проверяем, что они не задевают невыбранные моды (кроме
// «надмножеств» — модов, где есть все строки выбранного) и строки подсказки карты, и жадно
// покрываем набор: выгода = число новых покрытых модов / длина подстроки.

import type { MapModData, MapRegexData } from '../types/regex'
import { escapeRegex, foldYo } from './format'

const SUB_MIN = 2
const SUB_MAX = 14
const FORBIDDEN = /["!#\n]/

export interface ModIndex {
  mods: MapModData[]
  lines: string[][]
  byId: Map<string, number>
  /** подстрока → индексы модов, где она есть дословно */
  raw: Map<string, number[]>
  /** подстрока со свёрткой ё→е → индексы модов */
  folded: Map<string, number[]>
  /** supersets[i] — моды, где есть все строки мода i */
  supersets: Set<number>[]
  /** строки подсказки (со свёрткой) одной строкой — проверка ложных срабатываний */
  extraJoined: string
  extraMemo: Map<string, boolean>
  /** скомпилированные токены модов */
  tokenRe: RegExp[]
}

function addTo(map: Map<string, number[]>, key: string, idx: number): void {
  const list = map.get(key)
  if (!list) map.set(key, [idx])
  else if (list[list.length - 1] !== idx) list.push(idx)
}

/** Подстроки строки, пригодные как токен: без кавычек, !, #, без пробелов по краям. */
export function* tokenSubstrings(line: string, lo = SUB_MIN, hi = SUB_MAX): Generator<string> {
  for (let i = 0; i < line.length; i++) {
    for (let len = lo; len <= hi && i + len <= line.length; len++) {
      const s = line.slice(i, i + len)
      if (FORBIDDEN.test(s)) break
      if (s.startsWith(' ') || s.endsWith(' ')) continue
      yield s
    }
  }
}

const cache = new WeakMap<MapRegexData, ModIndex>()

/** Индекс подстрок по данным карт (строится один раз на объект данных). */
export function getModIndex(data: MapRegexData): ModIndex {
  const hit = cache.get(data)
  if (hit) return hit
  const mods = data.mods
  const lines = mods.map((m) => m.text.split('\n'))
  const raw = new Map<string, number[]>()
  const folded = new Map<string, number[]>()
  lines.forEach((ls, idx) => {
    for (const l of ls) {
      for (const s of tokenSubstrings(l)) {
        addTo(raw, s, idx)
        addTo(folded, foldYo(s), idx)
      }
    }
  })
  const supersets = lines.map((li, i) => {
    const out = new Set<number>()
    lines.forEach((lj, j) => {
      if (j !== i && li.every((l) => lj.includes(l))) out.add(j)
    })
    return out
  })
  const index: ModIndex = {
    mods,
    lines,
    byId: new Map(mods.map((m, i) => [m.id, i])),
    raw,
    folded,
    supersets,
    extraJoined: foldYo(data.extra.join('\n')),
    extraMemo: new Map(),
    tokenRe: mods.map((m) => new RegExp(m.token, 'i'))
  }
  cache.set(data, index)
  return index
}

function hitsExtra(index: ModIndex, foldedSub: string): boolean {
  let v = index.extraMemo.get(foldedSub)
  if (v === undefined) {
    v = index.extraJoined.includes(foldedSub)
    index.extraMemo.set(foldedSub, v)
  }
  return v
}

interface Candidate {
  re: string
  covered: number[]
  side: number[]
}

export interface CoverResult {
  /** фрагменты регулярки (объединяются через |) */
  tokens: string[]
  /** невыбранные моды, которые заденут токены (только у модов без уникальной подстроки) */
  side: number[]
}

/** Токен мода «как есть»: покрытие внутри набора и лишние совпадения (alsoMatches). */
function ownCandidate(index: ModIndex, i: number, inSet: Set<number>): Candidate {
  const re = index.tokenRe[i]
  const covered = [...inSet].filter((j) => j === i || index.lines[j].some((l) => re.test(l)))
  const side = (index.mods[i].alsoMatches ?? [])
    .map((id) => index.byId.get(id))
    .filter((j): j is number => j !== undefined && !inSet.has(j))
  return { re: index.mods[i].token, covered, side }
}

function costOf(c: Candidate): number {
  return c.re.length + 1
}

function totalLength(list: Candidate[]): number {
  return list.reduce((n, c) => n + c.re.length, 0) + Math.max(0, list.length - 1)
}

/** Покрыть моды `set` (индексы) минимальным по длине набором подстрок для "a|b|c". */
export function coverMods(index: ModIndex, set: number[]): CoverResult {
  const inSet = new Set(set)
  if (inSet.size === 0) return { tokens: [], side: [] }

  const own = [...inSet].map((i) => ownCandidate(index, i, inSet))
  const cands: Candidate[] = [...own]

  // общие подстроки, покрывающие ≥ 2 выбранных мода
  const seen = new Set<string>()
  for (const i of inSet) {
    for (const l of index.lines[i]) {
      for (const s of tokenSubstrings(l)) {
        if (seen.has(s)) continue
        seen.add(s)
        const covered = (index.raw.get(s) ?? []).filter((j) => inSet.has(j))
        if (covered.length < 2) continue
        const f = foldYo(s)
        const conflicts = (index.folded.get(f) ?? []).filter((j) => !inSet.has(j))
        const ok = conflicts.every((j) => covered.some((c) => index.supersets[c].has(j)))
        if (!ok || hitsExtra(index, f)) continue
        cands.push({ re: escapeRegex(s), covered, side: [] })
      }
    }
  }

  // жадно: максимум новых покрытых модов на символ
  const uncovered = new Set(inSet)
  const chosen: Candidate[] = []
  while (uncovered.size > 0) {
    let best: Candidate | null = null
    let bestGain = 0
    let bestRatio = -1
    for (const c of cands) {
      const gain = c.covered.filter((j) => uncovered.has(j)).length
      if (gain === 0) continue
      const ratio = gain / costOf(c)
      if (
        ratio > bestRatio ||
        (ratio === bestRatio && best && (costOf(c) < costOf(best) || (costOf(c) === costOf(best) && c.re < best.re)))
      ) {
        best = c
        bestRatio = ratio
        bestGain = gain
      }
    }
    if (!best || bestGain === 0) break
    chosen.push(best)
    for (const j of best.covered) uncovered.delete(j)
  }

  // лишние: всё, что они покрывают, уже покрыто другими
  for (let k = chosen.length - 1; k >= 0; k--) {
    const others = chosen.filter((_, m) => m !== k)
    const rest = new Set(others.flatMap((c) => c.covered))
    if (chosen[k].covered.filter((j) => inSet.has(j)).every((j) => rest.has(j))) chosen.splice(k, 1)
  }

  // запасной вариант — токен каждого мода; берём что короче
  const ownUnique = own.filter((c, k) => own.findIndex((o) => o.re === c.re) === k)
  const pick = totalLength(ownUnique) < totalLength(chosen) ? ownUnique : chosen
  const side = [...new Set(pick.flatMap((c) => c.side))].sort((a, b) => a - b)
  return { tokens: pick.map((c) => c.re), side }
}
