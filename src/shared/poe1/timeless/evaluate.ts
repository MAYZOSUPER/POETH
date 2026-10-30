// Исход сида timeless-самоцвета по 21 гнезду, лучшее гнездо и «сиды с таким же или лучшим исходом» (S45).
// Чистые функции: зовёт worker окна цены (renderer), тесты — напрямую. От языка предмета не зависит —
// только вид самоцвета и сид.

import {
  TIMELESS_KINDS,
  TIMELESS_UNKNOWN,
  outcomeAt,
  type TimelessDataKind,
  type TimelessDataRaw,
  type TimelessTable
} from './data'
import { TIMELESS_RULES, outcomeKey } from './rules'

/** Вид самоцвета из v0.1 (`TimelessSearch.jewel`) → вид с оценкой; null — оценки нет (Glorious Vanity, Abyss). */
export function dataKindOf(jewel: string): TimelessDataKind | null {
  return (TIMELESS_KINDS as readonly string[]).includes(jewel) ? (jewel as TimelessDataKind) : null
}

/** Сид с предмета (у Elegant Hubris — «монеты») → сид в данных; null — вне диапазона или не кратен. */
export function dataSeedOf(data: TimelessDataRaw, kind: TimelessDataKind, itemSeed: number): number | null {
  const j = data.jewels[kind]
  if (!Number.isInteger(itemSeed) || itemSeed % j.scale !== 0) return null
  const s = itemSeed / j.scale
  return s >= j.seeds[0] && s <= j.seeds[1] ? s : null
}

/** Сид в данных → как на предмете и на трейде. */
export function itemSeedOf(data: TimelessDataRaw, kind: TimelessDataKind, seed: number): number {
  return seed * data.jewels[kind].scale
}

export interface TimelessNote {
  /** номер исхода в `jewels[kind].outcomes` */
  code: number
  count: number
}

export interface SocketScore {
  /** индекс в `data.sockets` */
  socket: number
  /** `devotion` или id темы */
  theme: string
  /** Преданность или сколько нотаблов темы */
  score: number
  /** главные исходы гнезда: исходы темы (у Militant Faith — заменённые нотаблы), по убыванию */
  notes: TimelessNote[]
  /** нотаблов в радиусе без данных (новее лукапа) — оценка гнезда неполная */
  unknown: number
}

export interface TimelessEvaluation {
  kind: TimelessDataKind
  /** сид в данных */
  seed: number
  /** null — оценить нельзя: ни в одном гнезде нет исходов из правил */
  best: SocketScore | null
  /** лучшая тема каждого гнезда, по убыванию счёта */
  sockets: SocketScore[]
}

interface Compiled {
  kind: TimelessDataKind
  devotion?: { perCode: Int32Array; attr: number; small: number; rank: Int16Array }
  themes?: { id: string; mask: Uint8Array }[]
}

const compiledCache = new WeakMap<TimelessDataRaw, Map<TimelessDataKind, Compiled>>()

function compile(data: TimelessDataRaw, kind: TimelessDataKind): Compiled {
  let byKind = compiledCache.get(data)
  if (!byKind) compiledCache.set(data, (byKind = new Map()))
  const hit = byKind.get(kind)
  if (hit) return hit
  const rule = TIMELESS_RULES[kind]
  const jewel = data.jewels[kind]
  const keys = jewel.outcomes.map((o) => outcomeKey(o.id))
  let out: Compiled
  if (rule.metric === 'devotion') {
    const perCode = new Int32Array(256)
    const rank = new Int16Array(256).fill(-1)
    jewel.outcomes.forEach((o, code) => {
      perCode[code] = o.stats[rule.stat] ?? 0
      if (o.rep) rank[code] = rule.notable.indexOf(keys[code])
    })
    out = { kind, devotion: { perCode, attr: jewel.attr.stats[rule.stat] ?? 0, small: jewel.small.stats[rule.stat] ?? 0, rank } }
  } else {
    out = {
      kind,
      themes: rule.themes.map((t) => {
        const mask = new Uint8Array(256)
        keys.forEach((k, code) => {
          if (t.outcomes.includes(k)) mask[code] = 1
        })
        return { id: t.id, mask }
      })
    }
  }
  byKind.set(kind, out)
  return out
}

function notesOf(counts: Map<number, number>, order: (code: number) => number): TimelessNote[] {
  return [...counts]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || order(a.code) - order(b.code) || a.code - b.code)
}

function scoreSocket(c: Compiled, data: TimelessDataRaw, t: TimelessTable, si: number, seed: number): SocketScore {
  const s = data.sockets[si]
  const codes = s.notables.map((row) => outcomeAt(t, row, seed))
  const unknown = codes.filter((x) => x === TIMELESS_UNKNOWN).length
  if (c.devotion) {
    const d = c.devotion
    let score = s.attr * d.attr + s.small * d.small
    const replaced = new Map<number, number>()
    for (const code of codes) {
      if (code === TIMELESS_UNKNOWN) continue
      score += d.perCode[code]
      if (d.rank[code] >= 0) replaced.set(code, (replaced.get(code) ?? 0) + 1)
    }
    return { socket: si, theme: 'devotion', score, notes: notesOf(replaced, (x) => d.rank[x]), unknown }
  }
  let best: SocketScore = { socket: si, theme: c.themes![0].id, score: 0, notes: [], unknown }
  for (const th of c.themes!) {
    const counts = new Map<number, number>()
    let score = 0
    for (const code of codes) {
      if (code !== TIMELESS_UNKNOWN && th.mask[code]) {
        score++
        counts.set(code, (counts.get(code) ?? 0) + 1)
      }
    }
    if (score > best.score) best = { socket: si, theme: th.id, score, notes: notesOf(counts, () => 0), unknown }
  }
  return best
}

/** Исход сида по всем гнёздам и лучшее гнездо. `seed` — сид в данных. */
export function evaluateSeed(data: TimelessDataRaw, t: TimelessTable, seed: number): TimelessEvaluation {
  const c = compile(data, t.kind)
  const sockets = data.sockets
    .map((_, si) => scoreSocket(c, data, t, si, seed))
    .sort((a, b) => b.score - a.score || a.unknown - b.unknown || a.socket - b.socket)
  const best = sockets[0] && sockets[0].score > 0 ? sockets[0] : null
  return { kind: t.kind, seed, best, sockets }
}

/** Счёт сида по теме: лучшее гнездо (Преданность или сколько нотаблов темы). */
export function seedScore(data: TimelessDataRaw, t: TimelessTable, seed: number, theme: string): number {
  const c = compile(data, t.kind)
  const th = c.themes?.find((x) => x.id === theme)
  let best = 0
  for (const s of data.sockets) {
    let score = 0
    if (c.devotion) {
      score = s.attr * c.devotion.attr + s.small * c.devotion.small
      for (const row of s.notables) {
        const code = outcomeAt(t, row, seed)
        if (code !== TIMELESS_UNKNOWN) score += c.devotion.perCode[code]
      }
    } else if (th) {
      for (const row of s.notables) {
        const code = outcomeAt(t, row, seed)
        if (code !== TIMELESS_UNKNOWN && th.mask[code]) score++
      }
    }
    if (score > best) best = score
  }
  return best
}

export interface TimelessAnalogs {
  /** сиды в данных: сначала свой, затем с таким же счётом, затем с бо́льшим (ближе — раньше) */
  seeds: number[]
  /** сколько сидов диапазона дают такой же или лучший исход (может быть больше, чем `seeds`) */
  qualifying: number
  /** из них с таким же счётом */
  equal: number
  /** сидов в диапазоне */
  total: number
}

/**
 * «Сиды с таким же или лучшим исходом»: в каком-нибудь гнезде та же тема набирает не меньше, чем лучшее гнездо
 * этого сида. Для count-запроса на трейд — не больше `max` сидов.
 */
export function findAnalogs(data: TimelessDataRaw, t: TimelessTable, ev: TimelessEvaluation, max: number): TimelessAnalogs {
  const total = t.seedMax - t.seedMin + 1
  if (!ev.best || max <= 0) return { seeds: [], qualifying: 0, equal: 0, total }
  const want = ev.best.score
  const found: { seed: number; score: number }[] = []
  for (let seed = t.seedMin; seed <= t.seedMax; seed++) {
    const score = seed === ev.seed ? want : seedScore(data, t, seed, ev.best.theme)
    if (score >= want) found.push({ seed, score })
  }
  found.sort((a, b) => Number(b.seed === ev.seed) - Number(a.seed === ev.seed) || a.score - b.score || Math.abs(a.seed - ev.seed) - Math.abs(b.seed - ev.seed))
  return {
    seeds: found.slice(0, max).map((x) => x.seed),
    qualifying: found.length,
    equal: found.filter((x) => x.score === want).length,
    total
  }
}
