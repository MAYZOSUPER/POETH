// Форматирование вкладки «Богатство» (S11a): числа, время, свойства строк, график.

import type { WealthDiffLine, WealthLine, WealthPoint } from '@shared/types'

type T = (key: string, vars?: Record<string, string | number>) => string

/** 12 345 / 1 234.5 / 12.34 / 0.25 — без лишних знаков. */
export function fmtNum(n: number, lang: string): string {
  const abs = Math.abs(n)
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2
  return n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
}

/** Со знаком: +12.5 / −3 */
export function fmtSigned(n: number, lang: string): string {
  const s = fmtNum(Math.abs(n), lang)
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s
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

/** 1:05 / 12 мин */
export function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(m / 60)
  return h ? `${h}:${String(m % 60).padStart(2, '0')}` : `0:${String(m).padStart(2, '0')}`
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

export type ChartUnit = 'chaos' | 'divine'
export type ChartRange = 'day' | 'week' | 'all'

const RANGE_MS: Record<ChartRange, number> = { day: 24 * 3_600_000, week: 7 * 24 * 3_600_000, all: Infinity }

/** Точки диапазона в выбранной единице (divine — по курсу снимка; без курса точка пропускается). */
export function chartSeries(points: readonly WealthPoint[], range: ChartRange, unit: ChartUnit, now: number): Array<{ at: number; v: number }> {
  const from = now - RANGE_MS[range]
  const out: Array<{ at: number; v: number }> = []
  for (const p of points) {
    if (p.at < from) continue
    if (unit === 'chaos') out.push({ at: p.at, v: p.chaos })
    else if (p.divineRate > 0) out.push({ at: p.at, v: p.chaos / p.divineRate })
  }
  return out.sort((a, b) => a.at - b.at)
}

export interface ChartGeometry {
  line: string
  area: string
  min: number
  max: number
  dots: Array<{ x: number; y: number; at: number; v: number }>
}

/** Ломаная графика в координатах w×h (с полями pad). */
export function chartGeometry(series: Array<{ at: number; v: number }>, w: number, h: number, pad = 6): ChartGeometry | null {
  if (series.length < 2) return null
  const t0 = series[0].at
  const t1 = series[series.length - 1].at
  let min = Infinity
  let max = -Infinity
  for (const p of series) {
    min = Math.min(min, p.v)
    max = Math.max(max, p.v)
  }
  if (max === min) {
    max += 1
    min = Math.max(0, min - 1)
  }
  const sx = (at: number): number => pad + ((at - t0) / Math.max(1, t1 - t0)) * (w - 2 * pad)
  const sy = (v: number): number => h - pad - ((v - min) / (max - min)) * (h - 2 * pad)
  const dots = series.map((p) => ({ x: sx(p.at), y: sy(p.v), at: p.at, v: p.v }))
  const line = dots.map((d, i) => `${i ? 'L' : 'M'}${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' ')
  const area = `${line} L${dots[dots.length - 1].x.toFixed(1)},${h - pad} L${dots[0].x.toFixed(1)},${h - pad} Z`
  return { line, area, min, max, dots }
}
