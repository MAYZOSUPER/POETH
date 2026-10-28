// Форматирование вкладки «Богатство» (S11a): числа, время, свойства строк, график по макету v2.

import type { WealthDiffLine, WealthLine, WealthPoint } from '@shared/types'

type T = (key: string, vars?: Record<string, string | number>) => string

const locale = (lang: string): string => (lang === 'ru' ? 'ru-RU' : 'en-US')

/** Целое с разрядами: 1 846 / 1,846; минус — «−». */
export function nf(n: number, lang: string): string {
  const s = Math.round(Math.abs(n)).toLocaleString(locale(lang), { maximumFractionDigits: 0 })
  return n < 0 && Math.round(Math.abs(n)) !== 0 ? `−${s}` : s
}

/** Со знаком: +196 / −41 / ±0 */
export function sg(n: number, lang: string): string {
  const r = Math.round(n)
  return r > 0 ? `+${nf(r, lang)}` : r < 0 ? `−${nf(-r, lang)}` : '±0'
}

/** Дробное: 12,4 / 0,25 (для div и цены штуки). */
export function df(n: number, lang: string, digits = 1): string {
  return n.toLocaleString(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

/** Цена штуки: ≥ 10 — целое, меньше — до сотых. */
export function unitPrice(n: number, lang: string): string {
  return Math.abs(n) >= 10 ? nf(n, lang) : df(n, lang, 2)
}

export function toDivine(chaos: number, rate: number | undefined): number | null {
  return rate && rate > 0 ? chaos / rate : null
}

export function ago(t: T, at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return t('wealth.ago.now')
  const m = Math.round(s / 60)
  if (m < 60) return t('wealth.ago.min', { n: m })
  const h = Math.round(m / 60)
  if (h < 48) return t('wealth.ago.hour', { n: h })
  return t('wealth.ago.day', { n: Math.round(h / 24) })
}

export function until(t: T, at: number, now: number): string {
  const s = Math.max(0, Math.round((at - now) / 1000))
  return s < 90 ? t('wealth.in.sec', { n: s }) : t('wealth.in.min', { n: Math.round(s / 60) })
}

/** Промежуток «за 15 мин» / «за 3 ч» / «за сутки». */
export function span(t: T, ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000))
  if (m < 90) return t('wealth.span.min', { n: m })
  const h = Math.round(m / 60)
  return h >= 23 && h <= 25 ? t('wealth.span.day') : t('wealth.span.hour', { n: h })
}

/** 1:12:30 / 4:12 */
export function clock(ms: number, withHours = false): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const p = (x: number): string => String(x).padStart(2, '0')
  return withHours || h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`
}

export function timeOf(at: number, lang: string, withDate: boolean): string {
  return new Date(at).toLocaleString(locale(lang), withDate ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' })
}

/** Свойства строки: 6L, ур. 21 · 20%, T16, осквернён. */
export function lineFacts(t: T, l: WealthLine | WealthDiffLine): string[] {
  const out: string[] = []
  if (l.links) out.push(t('wealth.fact.links', { n: l.links }))
  if (l.gemLevel !== undefined) out.push(t('wealth.fact.gem', { l: l.gemLevel, q: l.gemQuality ?? 0 }))
  if (l.mapTier !== undefined) out.push(t('wealth.fact.tier', { n: l.mapTier }))
  if (l.corrupted) out.push(t('wealth.fact.corrupted'))
  return out
}

/** Цвет имени предмета (.ui-item): уник, рарка, камень, карта (обычный), валюта и прочее стакающееся. */
export function itemClass(l: WealthDiffLine): string {
  if (l.ns === 'UNIQUE') return 'ui-item--unique'
  if (l.reason === 'rare') return 'ui-item--rare'
  if (l.ns === 'GEM') return 'ui-item--gem'
  if (l.mapTier !== undefined) return ''
  return 'ui-item--currency'
}

// ------------------------------------------------------------------ график

export type ChartRange = '24h' | '7d' | 'league'
const RANGE_MS: Record<ChartRange, number> = { '24h': 24 * 3_600_000, '7d': 7 * 24 * 3_600_000, league: Infinity }

/** Размеры холста графика (как в макете). */
export const CH = { w: 560, h: 210, l: 44, r: 64, t: 14, b: 28 }

/** Точки диапазона (от последнего снимка назад). */
export function rangePoints(points: readonly WealthPoint[], range: ChartRange): WealthPoint[] {
  const p = [...points].sort((a, b) => a.at - b.at)
  if (!p.length) return p
  const from = p[p.length - 1].at - RANGE_MS[range]
  return p.filter((x) => x.at >= from)
}

/** «Красивый» шаг сетки: 1/2/2.5/5/10 · 10^n, ~4 деления. */
export function niceStep(spanV: number): number {
  const raw = spanV / 4
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

export interface ChartGeo {
  pts: WealthPoint[]
  step: number
  y0: number
  y1: number
  t0: number
  t1: number
  x: (at: number) => number
  y: (v: number) => number
  /** значения сетки по Y */
  grid: number[]
  /** метки по X: момент и выравнивание */
  ticks: Array<{ at: number; anchor: 'start' | 'middle' | 'end' }>
}

/** Геометрия графика: ось X по времени (от первой до последней точки диапазона), шкала Y не от нуля. */
export function chartGeo(pts: WealthPoint[]): ChartGeo | null {
  if (pts.length < 2) return null
  let mn = Infinity
  let mx = -Infinity
  for (const p of pts) {
    mn = Math.min(mn, p.chaos)
    mx = Math.max(mx, p.chaos)
  }
  const step = niceStep(Math.max(mx - mn, 20))
  const y0 = Math.floor(mn / step) * step
  let y1 = Math.ceil(mx / step) * step
  if (y1 === y0) y1 = y0 + step
  const t0 = pts[0].at
  const t1 = pts[pts.length - 1].at
  const pw = CH.w - CH.l - CH.r
  const ph = CH.h - CH.t - CH.b
  const x = (at: number): number => CH.l + (t1 === t0 ? pw / 2 : ((at - t0) / (t1 - t0)) * pw)
  const y = (v: number): number => CH.t + ph - ((v - y0) / (y1 - y0)) * ph
  const grid: number[] = []
  for (let v = y0; v <= y1 + step * 0.001; v += step) grid.push(v)
  const ticks: ChartGeo['ticks'] = []
  const n = 4
  for (let i = 0; i <= n; i++) ticks.push({ at: t0 + ((t1 - t0) * i) / n, anchor: i === 0 ? 'start' : i === n ? 'end' : 'middle' })
  return { pts, step, y0, y1, t0, t1, x, y, grid, ticks }
}

/** Подпись метки X: до двух суток — «−6 ч» / «сейчас», дальше — дата. */
export function tickLabel(t: T, at: number, t1: number, total: number, lang: string): string {
  if (total <= 48 * 3_600_000) {
    const h = Math.round((t1 - at) / 3_600_000)
    if (Math.abs(t1 - at) < 30 * 60_000) return t('wealth.chart.now')
    return h >= 1 ? t('wealth.chart.hAgo', { n: h }) : t('wealth.chart.mAgo', { n: Math.round((t1 - at) / 60_000) })
  }
  return new Date(at).toLocaleDateString(locale(lang), { day: '2-digit', month: '2-digit' })
}

/** Подпись Y: 12 400 → «12,4k» для больших значений, иначе целое. */
export function axisLabel(v: number, lang: string): string {
  return Math.abs(v) >= 100_000 ? `${df(v / 1000, lang, 0)}k` : nf(v, lang)
}
