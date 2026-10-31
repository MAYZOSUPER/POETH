// Подписи цен по результату распознавания (S68, чистый модуль). Результат распознавания (ScreenRead) живёт
// отдельно: подписи — лишь один его потребитель (второй — «Богатство PoE 2»). Цена — за штуку в базовой валюте
// игры (PoE 1 — chaos, PoE 2 — exalted), итог вкладки — сумма «цена × число» по ячейкам, где число прочитано
// уверенно. Неуверенное число в итог не идёт: ошибка распознавания бывает в разы (958 → 3583 у divine на сером
// эталоне стенда) и раздула бы итог; такие ячейки сосчитаны в uncounted, approx — «итог мог быть больше».

import type { ScreenLabel, ScreenLabels, ScreenRead, ScreenRect } from '../types/screen'

export interface UnitPrice {
  /** цена за штуку в базовой валюте */
  unit: number
  /** мало сделок / цена ненадёжна */
  low?: boolean
}

export type PriceOf = (item: string) => UnitPrice | null

export interface LabelOptions {
  base: 'chaos' | 'exalted'
  /** base за divine; null — курса нет */
  divine: number | null
}

/** Подписи по ячейкам с предметом; пустые и неузнанные — без подписи. */
export function buildLabels(read: ScreenRead, priceOf: PriceOf, o: LabelOptions): ScreenLabels {
  const labels: ScreenLabel[] = []
  let total = 0
  let unpriced = 0
  let uncounted = 0
  let counted = 0
  let approx = false
  for (const c of read.cells) {
    if (!c.present || !c.item) continue
    // уровни PoE 2 без раскладки: какой из предметов — неизвестно, цену не ставим
    const p = c.alt?.length && read.tab === null ? null : priceOf(c.item)
    if (!p || !(p.unit > 0)) {
      unpriced++
      continue
    }
    // только уверенно прочитанное число: неуверенное идёт в «число не прочитано», итог — с оговоркой
    const stack = c.count !== null && c.countSure ? p.unit * c.count : null
    if (stack !== null) {
      total += stack
      counted++
    } else {
      uncounted++
      if (c.count !== null) approx = true
    }
    labels.push({ rect: c.rect, unit: p.unit, stack, count: c.count, item: c.item, doubt: !!p.low || c.match < 0.55 })
  }
  return {
    game: read.game,
    base: o.base,
    divine: o.divine,
    labels,
    total,
    counted,
    unpriced,
    uncounted,
    approx,
    anchor: anchorOf(read),
    client: read.client,
    at: read.at
  }
}

/** Правый верхний угол области ячеек — туда ставится итог вкладки. */
export function anchorOf(read: ScreenRead): ScreenRect {
  if (!read.cells.length) return { x: 0, y: 0, width: 0, height: 0 }
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const c of read.cells) {
    x0 = Math.min(x0, c.rect.x)
    y0 = Math.min(y0, c.rect.y)
    x1 = Math.max(x1, c.rect.x + c.rect.width)
    y1 = Math.max(y1, c.rect.y + c.rect.height)
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

const SHORT: Record<'chaos' | 'exalted' | 'divine', string> = { chaos: 'c', exalted: 'ex', divine: 'div' }

/** Число по языку: RU — «4 148,5» (неразрывный пробел, запятая), EN — «4,148.5»; лишних нулей дроби нет. */
export function formatNumber(x: number, digits: number, lang: 'ru' | 'en'): string {
  return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(x)
}

/**
 * Короткая цена для подписи: от 1 divine — в divine (до 100 — с одним знаком), иначе в базовой валюте (до 10 — с одним
 * знаком, меньше 0,1 — «<0,1»). Разделители тысяч и дроби — по языку.
 */
export function formatPrice(v: number, base: 'chaos' | 'exalted', divine: number | null, lang: 'ru' | 'en'): string {
  const num = (x: number, digits: number): string => formatNumber(x, digits, lang)
  if (divine && divine > 0 && v >= divine) return `${num(v / divine, v / divine >= 100 ? 0 : 1)} ${SHORT.divine}`
  if (v < 0.1) return `<${num(0.1, 1)} ${SHORT[base]}`
  return `${num(v, v >= 10 ? 0 : 1)} ${SHORT[base]}`
}

/** Физические точки снимка → CSS-точки окна оверлея (оверлей лежит ровно на клиентской области игры). */
export function toCss(r: ScreenRect, dpr: number): ScreenRect {
  const k = dpr > 0 ? 1 / dpr : 1
  return { x: r.x * k, y: r.y * k, width: r.width * k, height: r.height * k }
}
