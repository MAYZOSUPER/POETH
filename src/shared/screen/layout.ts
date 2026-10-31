// Раскладки особых вкладок тайника и привязка к снимку (S68, чистый модуль).
//
// Раскладка — данные (resources/data/<игра>/screen/*.json): центры и размеры ячеек в точках эталонной высоты
// окна (PoE 2 — 1440: игра раскладывает интерфейс только по высоте окна), предмет каждой ячейки. В особой
// вкладке место — это и есть предмет: у валюты разных уровней PoE 2 один рисунок, различает только место.
//
// Привязка: кандидаты в ячейки с картинки (slots.ts, с ложными и пропусками) голосуют за масштаб и сдвиг
// раскладки — для каждого масштаба каждая пара «кандидат — ячейка раскладки» даёт сдвиг, сдвиг с наибольшим
// числом голосов и есть положение вкладки. Ложные кандидаты голосуют вразнобой и не мешают. Масштаб ищется
// в широких пределах вокруг высоты окна — любой масштаб интерфейса и режим (мышь / геймпад) без отдельных правил.
// Сдвиг на шаг сетки тоже набирает много голосов — окончательный выбор делает сверка иконок (recognize.ts).

import type { Rect } from '../ocr/bitmap'

export interface LayoutSlot {
  /** центр и размер ячейки, точки эталонной высоты */
  x: number
  y: number
  w: number
  h: number
  /** английское имя предмета; null — ячейка для любого предмета (свободная) */
  item: string | null
  /** другие предметы, которые игра кладёт в ту же ячейку */
  alt?: string[]
}

export interface TabLayout {
  /** ключ вкладки: 'orbs', 'essence', … */
  id: string
  slots: LayoutSlot[]
}

export interface LayoutSet {
  version: 1
  game: 'poe1' | 'poe2'
  /** эталонная высота окна, точки */
  refHeight: number
  tabs: TabLayout[]
  /** откуда раскладка и её лицензия */
  source?: string
}

/**
 * Пределы файла раскладок: файл приходит и с пакетом данных (userData/data), раздутый или кривой файл не должен
 * съесть память и время потока. Сейчас у PoE 2 — 13 вкладок, до 82 ячеек.
 */
export const LAYOUT_LIMITS = {
  tabs: 64,
  slots: 400,
  id: 64,
  name: 120,
  alt: 8,
  source: 500,
  /** эталонная высота окна и координаты, точки */
  height: 10_000,
  coord: 20_000,
  size: 2_000
} as const

const TAB_ID = /^[a-z0-9][a-z0-9-]*$/

/**
 * Разбор файла раскладок; null — не тот формат или за пределами LAYOUT_LIMITS (вкладок, ячеек больше). Лишние поля
 * игнорируются, кривые ячейки и имена длиннее предела выбрасываются.
 */
export function parseLayoutSet(json: unknown): LayoutSet | null {
  if (!json || typeof json !== 'object') return null
  const j = json as Record<string, unknown>
  if (j.version !== 1 || (j.game !== 'poe1' && j.game !== 'poe2')) return null
  const refHeight = Number(j.refHeight)
  if (!(refHeight > 100 && refHeight <= LAYOUT_LIMITS.height) || !Array.isArray(j.tabs) || j.tabs.length > LAYOUT_LIMITS.tabs) return null
  const num = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max
  const name = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= LAYOUT_LIMITS.name
  const tabs: TabLayout[] = []
  for (const t of j.tabs as unknown[]) {
    if (!t || typeof t !== 'object') continue
    const tt = t as Record<string, unknown>
    if (typeof tt.id !== 'string' || tt.id.length > LAYOUT_LIMITS.id || !TAB_ID.test(tt.id) || !Array.isArray(tt.slots)) continue
    if (tt.slots.length > LAYOUT_LIMITS.slots) return null
    const slots: LayoutSlot[] = []
    for (const s of tt.slots as unknown[]) {
      const ss = (s ?? {}) as Record<string, unknown>
      const { x, y, w, h } = ss
      if (!num(x, LAYOUT_LIMITS.coord) || !num(y, LAYOUT_LIMITS.coord) || !num(w, LAYOUT_LIMITS.size) || !num(h, LAYOUT_LIMITS.size) || w <= 0 || h <= 0) continue
      if (ss.item !== null && ss.item !== undefined && !name(ss.item)) continue
      const slot: LayoutSlot = { x, y, w, h, item: name(ss.item) ? ss.item : null }
      if (Array.isArray(ss.alt)) slot.alt = ss.alt.filter(name).slice(0, LAYOUT_LIMITS.alt)
      slots.push(slot)
    }
    if (slots.length) tabs.push({ id: tt.id, slots })
  }
  const source = typeof j.source === 'string' ? j.source.slice(0, LAYOUT_LIMITS.source) : undefined
  return tabs.length ? { version: 1, game: j.game, refHeight, tabs, source } : null
}

export interface Pt {
  x: number
  y: number
}

/** Положение раскладки на снимке: точка снимка = k · точка раскладки + (tx, ty). */
export interface Placement {
  tab: TabLayout
  k: number
  tx: number
  ty: number
  /** кандидатов, совпавших с ячейками раскладки */
  inliers: number
}

export interface PlaceOptions {
  /** пределы масштаба интерфейса относительно высоты окна (по умолчанию 0,55…1,6) */
  uMin?: number
  uMax?: number
  uStep?: number
  /** сколько разных положений вернуть (по умолчанию 4) */
  keep?: number
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  return s[s.length >> 1] ?? 0
}

/** Подогнать масштаб и сдвиг по парам (наименьшие квадраты, общий масштаб по x и y). */
function fit(pairs: ReadonlyArray<[Pt, Pt]>): { k: number; tx: number; ty: number } | null {
  if (pairs.length < 2) return null
  let px = 0
  let py = 0
  let qx = 0
  let qy = 0
  for (const [p, q] of pairs) {
    px += p.x
    py += p.y
    qx += q.x
    qy += q.y
  }
  const n = pairs.length
  px /= n
  py /= n
  qx /= n
  qy /= n
  let num = 0
  let den = 0
  for (const [p, q] of pairs) {
    num += (q.x - qx) * (p.x - px) + (q.y - qy) * (p.y - py)
    den += (q.x - qx) ** 2 + (q.y - qy) ** 2
  }
  if (den <= 0) return null
  const k = num / den
  return { k, tx: px - k * qx, ty: py - k * qy }
}

/** Пары «кандидат — ближайшая ячейка» при данном положении (каждая сторона — не больше одного раза). */
function matchPairs(points: readonly Pt[], tab: TabLayout, k: number, tx: number, ty: number, tol: number): Array<[Pt, Pt]> {
  const cands: Array<{ d: number; i: number; j: number }> = []
  for (let i = 0; i < points.length; i++)
    for (let j = 0; j < tab.slots.length; j++) {
      const s = tab.slots[j]
      const d = Math.hypot(points[i].x - (k * s.x + tx), points[i].y - (k * s.y + ty))
      if (d <= tol) cands.push({ d, i, j })
    }
  cands.sort((a, b) => a.d - b.d)
  const ui = new Set<number>()
  const uj = new Set<number>()
  const pairs: Array<[Pt, Pt]> = []
  for (const c of cands) {
    if (ui.has(c.i) || uj.has(c.j)) continue
    ui.add(c.i)
    uj.add(c.j)
    pairs.push([points[c.i], tab.slots[c.j]])
  }
  return pairs
}

/**
 * Положения раскладки tab по кандидатам points (центры, точки снимка). base — масштаб без масштаба интерфейса:
 * высота окна / эталонная высота. Возвращает до keep разных положений по числу совпавших кандидатов.
 */
export function placeLayout(points: readonly Pt[], tab: TabLayout, base: number, o: PlaceOptions = {}): Placement[] {
  const uMin = o.uMin ?? 0.55
  const uMax = o.uMax ?? 1.6
  const uStep = o.uStep ?? 0.015
  const keep = o.keep ?? 4
  if (points.length < 2 || !tab.slots.length) return []
  const w = median(tab.slots.map((s) => Math.min(s.w, s.h)))
  const raw: Placement[] = []
  // границы сдвигов: голоса — в плоский массив (Map на каждом масштабе — в разы медленнее)
  let px0 = Infinity
  let px1 = -Infinity
  let py0 = Infinity
  let py1 = -Infinity
  for (const p of points) {
    px0 = Math.min(px0, p.x)
    px1 = Math.max(px1, p.x)
    py0 = Math.min(py0, p.y)
    py1 = Math.max(py1, p.y)
  }
  let sx0 = Infinity
  let sx1 = -Infinity
  let sy0 = Infinity
  let sy1 = -Infinity
  for (const t of tab.slots) {
    sx0 = Math.min(sx0, t.x)
    sx1 = Math.max(sx1, t.x)
    sy0 = Math.min(sy0, t.y)
    sy1 = Math.max(sy1, t.y)
  }
  let votes = new Int32Array(0)
  for (let u = uMin; u <= uMax + 1e-9; u += uStep) {
    const k = base * u
    const bin = Math.max(2, k * w * 0.16)
    const ox = px0 - k * sx1
    const oy = py0 - k * sy1
    const nx = Math.ceil((px1 - k * sx0 - ox) / bin) + 2
    const ny = Math.ceil((py1 - k * sy0 - oy) / bin) + 2
    if (votes.length < nx * ny) votes = new Int32Array(nx * ny)
    else votes.fill(0, 0, nx * ny)
    // два лучших сдвига этого масштаба (второй — часто сдвиг на шаг сетки)
    let i1 = -1
    let n1 = 0
    let i2 = -1
    let n2 = 0
    for (const p of points)
      for (const t of tab.slots) {
        const bx = Math.round((p.x - k * t.x - ox) / bin)
        const by = Math.round((p.y - k * t.y - oy) / bin)
        const i = by * nx + bx
        const n = ++votes[i]
        if (n > n1) {
          if (i !== i1) {
            i2 = i1
            n2 = n1
          }
          i1 = i
          n1 = n
        } else if (n > n2 && i !== i1) {
          i2 = i
          n2 = n
        }
      }
    for (const [i, n] of [
      [i1, n1],
      [i2, n2]
    ]) {
      if (n < 2 || i < 0) continue
      const bx = i % nx
      const by = (i - bx) / nx
      raw.push({ tab, k, tx: ox + bx * bin, ty: oy + by * bin, inliers: n })
    }
  }
  raw.sort((a, b) => b.inliers - a.inliers)
  const out: Placement[] = []
  for (const r of raw.slice(0, keep * 3)) {
    // уточнение: пары в пределах трети ячейки → наименьшие квадраты, дважды
    let cur = { k: r.k, tx: r.tx, ty: r.ty }
    let pairs: Array<[Pt, Pt]> = []
    for (let it = 0; it < 3; it++) {
      pairs = matchPairs(points, tab, cur.k, cur.tx, cur.ty, cur.k * w * 0.32)
      const f = fit(pairs)
      if (!f || !(f.k > base * uMin * 0.8) || !(f.k < base * uMax * 1.25)) break
      cur = f
    }
    const placed: Placement = { tab, ...cur, inliers: pairs.length }
    const dup = out.some(
      (p) => Math.abs(p.k - placed.k) < placed.k * 0.03 && Math.hypot(p.tx - placed.tx, p.ty - placed.ty) < placed.k * w * 0.4
    )
    if (!dup) out.push(placed)
    if (out.length >= keep) break
  }
  return out.sort((a, b) => b.inliers - a.inliers)
}

/** Прямоугольник ячейки раскладки на снимке. */
export function slotRect(p: Placement, s: LayoutSlot): Rect {
  return { x: p.k * (s.x - s.w / 2) + p.tx, y: p.k * (s.y - s.h / 2) + p.ty, width: p.k * s.w, height: p.k * s.h }
}
