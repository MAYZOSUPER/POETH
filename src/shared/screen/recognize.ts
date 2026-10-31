// Распознавание особой вкладки тайника по снимку (S68, чистый модуль; в приложении — в потоке-воркере).
//
// 1. Кандидаты в ячейки по рамкам (slots.ts) на уменьшенной копии левой части окна (тайник у левого края).
// 2. Есть раскладки игры — каждая вкладка привязывается голосованием (layout.ts), лучшие положения сверяются с
//    иконками ожидаемых предметов: побеждает положение, где ячейки больше всего похожи на свои предметы (сдвиг на
//    шаг сетки так отсекается). Предмет ячейки — из раскладки (уровни PoE 2 различает только место).
// 3. Раскладки нет или ни одна не подошла — ячейки без раскладки: каждый кандидат сравнивается со всем каталогом,
//    из пересекающихся остаётся лучший по сходству, предмет — ближайшая иконка.
// 4. «Есть предмет / пусто»: пустую ячейку игра рисует тёмным серым силуэтом — яркость под маской иконки заметно
//    ниже, чем у самой иконки. Число стопки — readCount (OCR S28, stack.ts), только у ячеек с предметом.

import { clampRect, type Bitmap, type Rect } from '../ocr/bitmap'
import type { ScreenCell, ScreenTiming } from '../types/screen'
import { inset, samplePatch, shrinkGray, toGray } from './image'
import { bestPlacement, cellPatch, iconRect, nearestIcons, type IconDesc, type IconScore } from './icons'
import { placeLayout, slotRect, type LayoutSet, type Placement } from './layout'
import { pickSlots, slotCandidates, type SlotBox } from './slots'

/** Размер ячейки, доли высоты окна: от мелких (PoE 1 при малом масштабе) до крупных. */
export const SLOT_RANGE: readonly [number, number] = [0.024, 0.08]
/** Высота уменьшенной копии для поиска рамок. */
const WORK_HEIGHT = 720
/** Доли ячейки, которые может занимать иконка (подбирается по вкладке). */
const FRACS = [0.76, 0.84, 0.92, 1.0]
/** Сдвиги иконки внутри ячейки, доли стороны. */
const SHIFTS = [-0.03, 0, 0.03]
/**
 * Ячейка с предметом: разброс яркости под маской иконки не ниже этой доли разброса у самой иконки. Пустую ячейку
 * игра рисует плоским тёмным силуэтом (эталоны PoE 2: у предметов 0,9–2, у силуэтов 0,15–0,4).
 */
export const PRESENT_CONTRAST = 0.6
/** Совпадение с ожидаемым предметом раскладки, ниже которого предмет ищется по всему каталогу. */
const LAYOUT_MATCH = 0.45
/** Вкладка узнана: среднее сходство видимых ячеек с их предметами не ниже (эталоны PoE 2: верно 0,65–0,86, сдвиги — ниже). */
const MIN_VERIFY = 0.45
/** Разброс яркости занятой ячейки (см. occupied). */
const OCCUPIED_SD = 20
/** Без раскладки: сходство, ниже которого кандидат — не ячейка с предметом. */
const FREE_MATCH = 0.5

export type ReadCount = (img: Bitmap, cell: Rect) => { count: number; sure: boolean } | null

export interface StashInput {
  /** снимок клиентской области (или её части — тогда clientHeight от всего окна) */
  img: Bitmap
  clientHeight: number
  icons: readonly IconDesc[]
  layouts?: LayoutSet | null
  readCount?: ReadCount | null
  /** где искать (по умолчанию левая часть окна шириной в высоту) */
  region?: Rect
  now?: () => number
}

export interface StashResult {
  tab: string | null
  scale: number | null
  cells: ScreenCell[]
  ms: Omit<ScreenTiming, 'capture'>
  /** для отладки и тестов: кандидаты и выбранное положение раскладки */
  debug: { candidates: number; placement: Placement | null; verify: number; frac: number }
}

const inside = (r: Rect, w: number, h: number): boolean => r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= h

/**
 * Сверка положения p с иконками ожидаемых предметов. score — сумма сходства по выборке ячеек раскладки, делённая
 * на всю выборку (ячейка вне снимка — ноль): положение, уводящее половину вкладки за край, не выигрывает на
 * немногих видимых ячейках. mean — среднее по видимым (порог «вкладка узнана»), frac — лучшая доля иконки в ячейке.
 */
function verifyPlacement(img: Bitmap, p: Placement, byName: Map<string, IconDesc>): { score: number; mean: number; frac: number; n: number } {
  const slots = p.tab.slots.filter((s) => s.item && byName.has(s.item))
  const step = Math.max(1, Math.floor(slots.length / 32))
  const sums = FRACS.map(() => 0)
  let all = 0
  let n = 0
  for (let i = 0; i < slots.length; i += step) {
    all++
    const s = slots[i]
    const rect = slotRect(p, s)
    if (!inside(rect, img.width, img.height)) continue
    const icon = byName.get(s.item!)!
    FRACS.forEach((f, fi) => {
      sums[fi] += bestPlacement(img, rect, icon, [f], [0]).score.shape
    })
    n++
  }
  if (n < 3) return { score: 0, mean: 0, frac: FRACS[1], n }
  let best = 0
  for (let i = 1; i < sums.length; i++) if (sums[i] > sums[best]) best = i
  return { score: sums[best] / all, mean: sums[best] / n, frac: FRACS[best], n }
}

/**
 * Тонкая подгонка положения по иконкам: покоординатный спуск по масштабу и сдвигу (шаги от 2 % масштаба и 8 %
 * ячейки до четверти этого), цель — среднее сходство выборки видимых ячеек с их предметами. Подгонка по парам
 * кандидатов (layout.ts) тянется ложными кандидатами — на краю большой вкладки это полячейки.
 */
function refinePlacement(img: Bitmap, p: Placement, byName: Map<string, IconDesc>, frac: number): Placement {
  const slots = p.tab.slots.filter((s) => s.item && byName.has(s.item) && inside(slotRect(p, s), img.width, img.height))
  if (slots.length < 3) return p
  // выборка по всей площади вкладки: края важнее всего для масштаба
  const step = Math.max(1, Math.floor(slots.length / 20))
  const sample = slots.filter((_, i) => i % step === 0)
  const score = (q: Placement): number => {
    let sum = 0
    for (const s of sample) {
      const r = slotRect(q, s)
      sum += inside(r, img.width, img.height) ? bestPlacement(img, r, byName.get(s.item!)!, [frac], [0]).score.shape : 0
    }
    return sum / sample.length
  }
  const w = slotRect(p, sample[0]).width
  let cur = p
  let best = score(cur)
  for (const k of [1, 0.5, 0.25]) {
    for (const [dk, dx, dy] of [
      [0.02, 0, 0],
      [-0.02, 0, 0],
      [0, 0.08, 0],
      [0, -0.08, 0],
      [0, 0, 0.08],
      [0, 0, -0.08]
    ] as const) {
      // масштаб — вокруг центра вкладки, чтобы не сдвигать её целиком
      const nk = cur.k * (1 + dk * k)
      const cx = cur.tx + cur.k * 400
      const cy = cur.ty + cur.k * 400
      const q: Placement = { ...cur, k: nk, tx: cx - nk * 400 + dx * k * w, ty: cy - nk * 400 + dy * k * w }
      const v = score(q)
      if (v > best) {
        best = v
        cur = q
      }
    }
  }
  return cur
}

function cellFrom(rect: Rect, item: string | null, s: IconScore | null, extra: Partial<ScreenCell> = {}): ScreenCell {
  return {
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    item,
    present: !!s && s.contrast >= PRESENT_CONTRAST && s.shape >= 0.2,
    count: null,
    countSure: false,
    match: s ? Math.max(0, Math.min(1, s.total)) : 0,
    ...extra
  }
}

/**
 * Ячейка занята чем-то (без сравнения с иконкой): разброс яркости внутри ячейки. Пустую свободную ячейку игра
 * рисует ровным тёмным узором (эталоны PoE 2: разброс 4–10), предмет — рисунком с бликами (30+).
 */
export function occupied(img: Bitmap, rect: Rect): boolean {
  const p = samplePatch(img, inset(rect, 0.14), 16)
  let m = 0
  for (const v of p.y) m += v
  m /= p.y.length
  let d = 0
  for (const v of p.y) d += (v - m) * (v - m)
  return Math.sqrt(d / p.y.length) >= OCCUPIED_SD
}

/** Предметы с тем же рисунком, что у лучшего, и почти тем же сходством (уровни PoE 2 без раскладки). */
function sameArt(best: IconDesc, icons: readonly IconDesc[]): string[] {
  return icons.filter((i) => i !== best && i.art === best.art).map((i) => i.name)
}

export function recognizeStash(inp: StashInput): StashResult {
  const now = inp.now ?? (() => performance.now())
  const t0 = now()
  const { img } = inp
  const H = inp.clientHeight
  const region = clampRect(inp.region ?? { x: 0, y: 0, width: Math.min(img.width, H), height: img.height }, img.width, img.height)
  const kw = Math.min(1, WORK_HEIGHT / H)
  const gray = shrinkGray(toGray(img, region), kw)
  const cands: SlotBox[] = slotCandidates(gray, { minSize: SLOT_RANGE[0] * H * kw, maxSize: SLOT_RANGE[1] * H * kw }).map((b) => ({
    ...b,
    x: region.x + b.x / kw,
    y: region.y + b.y / kw,
    size: b.size / kw
  }))
  const byName = new Map(inp.icons.map((i) => [i.name, i]))
  const points = cands.map((b) => ({ x: b.x + b.size / 2, y: b.y + b.size / 2 }))

  // 2. раскладки
  let chosen: { p: Placement; verify: number; score: number; frac: number } | null = null
  if (inp.layouts && points.length >= 3) {
    const base = H / inp.layouts.refHeight
    const all: Placement[] = []
    for (const tab of inp.layouts.tabs) all.push(...placeLayout(points, tab, base))
    all.sort((a, b) => b.inliers - a.inliers)
    const top = all.filter((p) => p.inliers >= Math.max(4, (all[0]?.inliers ?? 0) * 0.45)).slice(0, 8)
    for (const p0 of top) {
      const v0 = verifyPlacement(img, p0, byName)
      if (v0.n < 3 || v0.mean < MIN_VERIFY * 0.6) continue
      const p = refinePlacement(img, p0, byName, v0.frac)
      const v = verifyPlacement(img, p, byName)
      if (v.n >= 3 && v.mean >= MIN_VERIFY && v.score > (chosen?.score ?? 0)) chosen = { p, verify: v.mean, score: v.score, frac: v.frac }
    }
  }
  const t1 = now()

  const cells: ScreenCell[] = []
  let frac = chosen?.frac ?? FRACS[1]
  if (chosen) {
    const { p } = chosen
    p.tab.slots.forEach((s, slot) => {
      const rect = slotRect(p, s)
      if (!inside(rect, img.width, img.height)) return
      const icon = s.item ? byName.get(s.item) : undefined
      let best = icon ? bestPlacement(img, rect, icon, [frac], SHIFTS) : null
      if (icon && best && best.score.total >= LAYOUT_MATCH) {
        cells.push(cellFrom(rect, icon.name, best.score, { slot, ...(s.alt?.length ? { alt: s.alt } : {}) }))
        return
      }
      // свободная ячейка или не похоже на свой предмет — ближайшая иконка каталога
      const hits = nearestIcons(cellPatch(img, iconRect(rect, frac)), inp.icons, 1)
      const hit = hits[0]
      if (hit && hit.score.total >= FREE_MATCH && hit.score.total > (best?.score.total ?? -1)) {
        best = bestPlacement(img, rect, hit.icon, [frac], SHIFTS)
        cells.push(cellFrom(rect, hit.icon.name, best.score, { slot }))
      } else if (!s.item) {
        // свободная ячейка с предметом не из каталога: «занято», но не узнано (без цены)
        cells.push({ ...cellFrom(rect, null, null, { slot }), present: occupied(img, rect) })
      } else cells.push(cellFrom(rect, s.item, best?.score ?? null, { slot, ...(s.alt?.length ? { alt: s.alt } : {}) }))
    })
  } else {
    // 3. без раскладки: у найденного квадрата рамка может быть внешней или внутренней — ближайшие иконки при каждой
    // доле ячейки, затем лучшая доля и сдвиг для них; из пересекающихся кандидатов остаётся самый похожий
    const ranked = cands.map((b) => {
      const rect = { x: b.x, y: b.y, width: b.size, height: b.size }
      const pool = new Map<IconDesc, number>()
      for (const f of FRACS)
        for (const h of nearestIcons(cellPatch(img, iconRect(rect, f)), inp.icons, 2)) pool.set(h.icon, Math.max(pool.get(h.icon) ?? -1, h.score.total))
      const short = [...pool.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3)
      let best: { icon: IconDesc; rect: Rect; score: IconScore } | null = null
      if (short.length && short[0][1] >= FREE_MATCH * 0.7)
        for (const [icon] of short) {
          const p = bestPlacement(img, rect, icon, FRACS, SHIFTS)
          if (!best || p.score.total > best.score.total) best = { icon, ...p }
        }
      return { ...b, best }
    })
    const picked = pickSlots(ranked, (b) => (b.best && b.best.score.total >= FREE_MATCH ? b.best.score.total : 0), 0.3)
    for (const b of picked) {
      const rect = { x: b.x, y: b.y, width: b.size, height: b.size }
      const alt = sameArt(b.best!.icon, inp.icons)
      cells.push(cellFrom(rect, b.best!.icon.name, b.best!.score, alt.length ? { alt } : {}))
    }
    frac = FRACS[1]
  }
  const t2 = now()

  // 4. числа стопок
  if (inp.readCount)
    for (const c of cells) {
      if (!c.present) continue
      const r = inp.readCount(img, c.rect)
      if (r) {
        c.count = r.count
        c.countSure = r.sure
      }
    }
  const t3 = now()
  return {
    tab: chosen?.p.tab.id ?? null,
    scale: chosen ? chosen.p.k : null,
    cells,
    ms: { find: t1 - t0, match: t2 - t1, ocr: t3 - t2, total: t3 - t0 },
    debug: { candidates: cands.length, placement: chosen?.p ?? null, verify: chosen?.verify ?? 0, frac }
  }
}
