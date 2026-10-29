// Чтение стакана со снимка (S28, чистый модуль; распознаватель передаётся снаружи — tesseract в main/ocr).
// Разметка (segment.ts) → каждое число отдельно в нескольких вариантах подготовки (cells.ts) → голосование.
// Неверное число хуже, чем никакого: ячейка «уверенная», только если варианты сошлись и число знаков совпало
// с разметкой. Неуверенную ячейку показываем игроку на проверку, а в расчёт без подтверждения не берём.

import type { BookDoubt, BookReading, BookRow } from '../types/flip'
import { bookDoubts } from '../flip/book'
import type { Bitmap } from './bitmap'
import { cellImage, COMBO_VARIANTS, countGlyphs, glyphsOf, VARIANTS, type Glyph, type GlyphCount, type Gray } from './cells'
import { compareTo, glyphVector, nearest, type Sample } from './glyphs'
import { findTable, type CellRect, type TableLayout } from './segment'
import type { Box } from './segment'

/** Распознать одно число на картинке (тёмное на белом) — сырой текст. */
export type OcrFn = (img: Gray) => string

export type CellKind = 'ratio' | 'stock'

export interface CellRead {
  /** как прочитано и нормализовано: '296', '1.04'; '' — не прочитано */
  text: string
  value: number | null
  /** варианты подготовки сошлись, число знаков совпало с разметкой */
  sure: boolean
}

export interface RowRead {
  /** «‹ 1 : 318» — всё, что дороже (последняя строка) */
  beyond: boolean
  /** «Хочу : Имею» — левая и правая часть курса */
  want: CellRead
  have: CellRead
  stock: CellRead
}

export interface TableRead {
  rows: RowRead[]
  /** высота цифр на снимке, точки */
  glyphH: number
  /** сколько раз вызывали распознаватель */
  calls: number
}

/** Пробелы долой; у количества — разделители тысяч («1,200», «1.200»), у курса — запятая как точка. */
export function normalizeNumber(raw: string, kind: CellKind): string {
  const s = raw.replace(/\s+/g, '')
  if (kind === 'stock') return /^\d{1,3}([.,]\d{3})+$/.test(s) ? s.replace(/[.,]/g, '') : s
  return s.replace(/,/g, '.')
}

/** Похоже на число своей колонки: количество — целое ≥ 1, курс — положительное, не больше одной точки. */
export function numberFormatOk(s: string, kind: CellKind): boolean {
  if (kind === 'stock') return /^[1-9]\d{0,6}$/.test(s)
  return /^(0|[1-9]\d{0,6})(\.\d{1,4})?$/.test(s) && Number(s) > 0
}

/** Совпадает ли прочитанное с разметкой: цифр столько же, точка там, где она видна. */
export function fitsGlyphs(s: string, kind: CellKind, g: GlyphCount): boolean {
  if (!numberFormatOk(s, kind)) return false
  if (!g.sure) return true
  const digits = s.replace(/\D/g, '').length
  if (digits !== g.digits) return false
  return kind === 'stock' || (s.includes('.') ? 1 : 0) === g.dots
}

/**
 * Итог голосования по прочтениям одной ячейки. Пустое прочтение — воздержание (tesseract часто молчит на
 * одиночной цифре). Уверенно, если за лучшее число не меньше двух голосов, «похожих на разметку» соперников
 * мало (на каждого нужно ещё два голоса сверху), а непохожих на разметку прочтений меньше, чем голосов за.
 */
export function decide(tried: readonly string[], fits: (s: string) => boolean, kind: CellKind): { text: string; sure: boolean } {
  const votes = new Map<string, number>()
  for (const s of tried) if (s) votes.set(s, (votes.get(s) ?? 0) + 1)
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1])
  const fitting = ranked.filter(([s]) => fits(s))
  if (!fitting.length) return { text: ranked.find(([s]) => numberFormatOk(s, kind))?.[0] ?? '', sure: false }
  const [best, n] = fitting[0]
  const rival = fitting.slice(1).reduce((sum, [, k]) => sum + k, 0)
  const misfit = ranked.filter(([s]) => !fits(s)).reduce((sum, [, k]) => sum + k, 0)
  return { text: best, sure: n >= 2 && n >= rival * 2 + 2 && n > misfit }
}

interface CellJob {
  rect: CellRect
  parts: Box[]
  kind: CellKind
  y0: number
  y1: number
  /** прочтения курса целиком «A:B» (с двоеточием, больше контекста распознавателю) — по запросу */
  combo?: () => string[]
}

/** Ячейка в работе: прочтение, все голоса распознавателя и знаки по разметке (для сверки по образцам). */
interface CellState {
  read: CellRead
  tried: string[]
  glyphs: Glyph[]
  fits: (s: string) => boolean
}

function readCell(t: TableLayout, job: CellJob, ocr: OcrFn, count: { calls: number }): CellState {
  const glyphs = glyphsOf(job.parts, t.glyphH, job.y0, job.y1)
  const g = countGlyphs(job.parts, t.glyphH, job.y0, job.y1)
  const fits = (s: string): boolean => fitsGlyphs(s, job.kind, g)
  const read = (v: (typeof VARIANTS)[number]): string => {
    count.calls++
    return normalizeNumber(ocr(cellImage(t, job.rect, v)), job.kind)
  }
  const tried = [read(VARIANTS[0]), read(VARIANTS[1])]
  // основной проход: два варианта сошлись и совпали с разметкой — дальше не читаем
  if (tried[0] && tried[0] === tried[1] && fits(tried[0])) return { read: cell(tried[0], true), tried, glyphs, fits }
  for (const v of VARIANTS.slice(2)) tried.push(read(v))
  if (job.combo) tried.push(...job.combo())
  const res = decide(tried, fits, job.kind)
  return { read: cell(res.text, res.sure), tried, glyphs, fits }
}

/** Пороги сверки по образцам (подобраны на фикстурах 0,66×–3×; шум растёт на малом разрешении). */
const DEMOTE_OWN = 0.5
const DEMOTE_GAP = 0.2
const CONFIRM_BEST = 0.8
const CONFIRM_GAP = 0.15

/**
 * Сверка знаков по образцам этой же таблицы (glyphs.ts): уверенная ячейка, цифра которой явно похожа на
 * другую цифру, — на проверку; сомнительная, все знаки которой уверенно узнаны, — подтверждается, если
 * распознаватель хоть раз прочитал её так же.
 */
function crossCheck(t: TableLayout, cells: CellState[]): void {
  const digitsOf = (c: CellState): Glyph[] => c.glyphs.filter((g) => g.kind === 'digit')
  const sampleSet = (): Sample[] => {
    const out: Sample[] = []
    cells.forEach((c, id) => {
      if (!c.read.sure || c.glyphs.some((g) => g.kind === 'junk')) return
      const labels = c.read.text.replace(/\D/g, '')
      const dg = digitsOf(c)
      if (dg.length !== labels.length) return
      dg.forEach((g, i) => out.push({ vec: glyphVector(t, g.box), label: labels[i], cell: id }))
    })
    return out
  }
  let samples = sampleSet()
  cells.forEach((c, id) => {
    if (!c.read.sure) return
    const labels = c.read.text.replace(/\D/g, '')
    const dg = digitsOf(c)
    if (dg.length !== labels.length) return
    const bad = dg.some((g, i) => {
      const m = compareTo(glyphVector(t, g.box), labels[i], samples, id)
      return m.known && m.best < DEMOTE_OWN && m.other - m.best >= DEMOTE_GAP
    })
    if (bad) c.read = { ...c.read, sure: false }
  })
  samples = sampleSet()
  for (const c of cells) {
    if (c.read.sure || !c.glyphs.length || c.glyphs.some((g) => g.kind === 'junk')) continue
    let text = ''
    for (const g of c.glyphs) {
      if (g.kind === 'dot') {
        text += '.'
        continue
      }
      const m = nearest(glyphVector(t, g.box), samples, -1)
      if (!m || m.best < CONFIRM_BEST || m.best - m.other < CONFIRM_GAP) {
        text = ''
        break
      }
      text += m.label
    }
    if (text && c.fits(text) && c.tried.includes(text)) c.read = cell(text, true)
  }
}

function cell(text: string, sure: boolean): CellRead {
  const value = text && Number.isFinite(Number(text)) ? Number(text) : null
  return { text, value, sure: sure && value !== null }
}

/** «1:296» → ['1', '296']; не курс — null. */
export function splitRatio(raw: string): [string, string] | null {
  const parts = normalizeNumber(raw, 'ratio').split(':')
  if (parts.length !== 2 || !parts.every((p) => numberFormatOk(p, 'ratio'))) return null
  return [parts[0], parts[1]]
}

/**
 * Найти и прочитать стакан на снимке у курсора. hint — ожидаемая высота цифр (по высоте окна игры).
 * null — таблицы на снимке нет.
 */
export function readTable(img: Bitmap, hint: number, ocr: OcrFn): TableRead | null {
  const t = findTable(img, hint)
  if (!t) return null
  const count = { calls: 0 }
  const states = t.rows.map((r) => {
    // курс целиком (с двоеточием) — общий для левой и правой части, читается один раз и только при сомнении
    let combo: Array<[string, string] | null> | null = null
    const ratio = (): Array<[string, string] | null> => {
      if (combo) return combo
      const rect: CellRect = { x0: r.a.x0, y0: r.a.y0, x1: r.b.x1, y1: r.b.y1 }
      combo = COMBO_VARIANTS.map((v) => {
        count.calls++
        return splitRatio(ocr(cellImage(t, rect, v)))
      })
      return combo
    }
    const job = (rect: CellRect, parts: Box[], kind: CellKind, side?: 0 | 1): CellJob => ({
      rect,
      parts,
      kind,
      y0: r.y0,
      y1: r.y1,
      combo: side === undefined ? undefined : () => ratio().map((p) => p?.[side] ?? '')
    })
    return {
      beyond: r.beyond,
      want: readCell(t, job(r.a, r.parts.a, 'ratio', 0), ocr, count),
      have: readCell(t, job(r.b, r.parts.b, 'ratio', 1), ocr, count),
      stock: readCell(t, job(r.stock, r.parts.stock, 'stock'), ocr, count)
    }
  })
  crossCheck(
    t,
    states.flatMap((r) => [r.want, r.have, r.stock])
  )
  const rows = states.map(
    (r): RowRead => ({ beyond: r.beyond, want: r.want.read, have: r.have.read, stock: r.stock.read })
  )
  return { rows, glyphH: t.glyphH, calls: count.calls }
}

/** Доля сомнительных ячеек, выше которой стакан не показываем вовсе («не удалось прочитать, повторите»). */
const UNREADABLE_SHARE = 0.5

/** Прочитанная таблица → стакан: числа, сомнения распознавателя и проверки строк (shared/flip/book). */
export function bookFromTable(t: TableRead, at: number): BookReading | null {
  const rows: BookRow[] = t.rows.map((r) => ({
    want: r.want.value ?? 0,
    have: r.have.value ?? 0,
    stock: r.stock.value ?? 0,
    ...(r.beyond ? { beyond: true } : {})
  }))
  const doubt: BookDoubt[] = []
  t.rows.forEach((r, row) => {
    for (const cell of ['want', 'have', 'stock'] as const) if (!r[cell].sure) doubt.push({ row, cell })
  })
  if (!rows.length || doubt.length > rows.length * 3 * UNREADABLE_SHARE) return null
  for (const d of bookDoubts(rows)) if (!doubt.some((x) => x.row === d.row && x.cell === d.cell)) doubt.push(d)
  doubt.sort((a, b) => a.row - b.row || a.cell.localeCompare(b.cell))
  return { at, rows, doubt, source: 'screen' }
}
