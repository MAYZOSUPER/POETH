// POETH (S23): строка мода для показа — как в игре, с числами. Фильтр хранит шаблон перевода с # и одно
// значение, а у модов «от # до #» это среднее: «Adds … to … Lightning Damage to Attacks · 18». Числа каждого
// места берутся из текста предмета (тот же шаблон перевода, что нашёл парсер), а среднее показывается отдельно
// и приглушённо. «+» сохраняем: у ref «+# to Evasion Rating» шаблон перевода без «+» («# to Evasion Rating»),
// а в игре — «+40 to Evasion Rating». Ref на английском, поэтому правило одинаково для EN и RU.

import type { StatSource } from '../../parser/modifiers'

/** Строка мода: шаблон с # и числа по местам. */
export interface ModText {
  /** шаблон на языке предмета (# — места чисел) */
  text: string
  /** числа по местам # как в игре; нет — показать «…» */
  nums?: number[]
  /** «+» перед числом места */
  plus: boolean[]
  /** среднее «от # до #» — то, что сравнивает фильтр (у одного # — нет) */
  avg?: number
}

const NUM = '([+-]?\\d+(?:\\.\\d+)?)(?:\\([^)]*\\))?'
/** хвост строки предмета после мода: « (implicit)», « (crafted)», « — Unscalable Value» */
const TAIL = '(?:\\s+\\([^)]*\\))*(?:\\s+—.*)?$'

function lineRegex(template: string): RegExp {
  const parts = template.split('#').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^${parts.join(NUM)}${TAIL}`)
}

const placeholders = (s: string): number => s.split('#').length - 1

/** Перед k-м # стоит «+» (ref «+#% to …»). */
function plusAt(s: string): boolean[] {
  const out: boolean[] = []
  for (let i = s.indexOf('#'); i !== -1; i = s.indexOf('#', i + 1)) out.push(s[i - 1] === '+')
  return out
}

/**
 * Числа строк предмета для источников стата: строка, которую парсер разобрал шаблоном источника; при
 * нескольких одинаковых строках — та, чьё среднее равно значению источника. Суммы по местам.
 */
function sourceNumbers(sources: readonly StatSource[], rawText: string, count: number): number[] | undefined {
  if (!sources.length) return undefined
  const lines = rawText.split(/\r?\n/)
  const used = new Set<number>()
  const sum: number[] = new Array(count).fill(0)
  for (const s of sources) {
    const tpl = s.stat.translation.string
    if (placeholders(tpl) !== count) return undefined
    const re = lineRegex(tpl)
    const found: Array<{ i: number; nums: number[] }> = []
    lines.forEach((line, i) => {
      if (used.has(i)) return
      const m = re.exec(line.trim())
      if (m) found.push({ i, nums: m.slice(1, count + 1).map(Number) })
    })
    const want = s.stat.roll?.value
    const avgOf = (n: number[]): number => n.reduce((a, b) => a + b, 0) / n.length
    const pick =
      found.find((f) => want !== undefined && Math.abs(Math.abs(avgOf(f.nums)) - Math.abs(want)) < 1e-6) ?? found[0]
    if (!pick) return undefined
    used.add(pick.i)
    pick.nums.forEach((n, k) => (sum[k] += Math.abs(n)))
  }
  return sum
}

/**
 * Строка мода для показа.
 * @param text шаблон перевода (# — места чисел)
 * @param ref ref стата (английский): по нему — «+» перед числом
 * @param value значение фильтра / стата (у «от # до #» — среднее)
 * @param sources источники стата (моды предмета)
 * @param rawText текст предмета (Ctrl+C) — для чисел «от # до #»
 */
export function modText(
  text: string,
  ref: string,
  value: number | undefined,
  sources: readonly StatSource[],
  rawText?: string
): ModText {
  const count = placeholders(text)
  const refPlus = placeholders(ref) === count ? plusAt(ref) : []
  const textPlus = plusAt(text)
  const plus = textPlus.map((had, k) => !had && Boolean(refPlus[k]))
  if (count === 0 || value === undefined) return { text, plus }
  if (count === 1) {
    return { text, nums: [value], plus: value < 0 ? [false] : plus }
  }
  const nums = rawText ? sourceNumbers(sources, rawText, count) : undefined
  if (!nums) return { text, plus, avg: value }
  return { text, nums, plus, avg: nums.reduce((a, b) => a + b, 0) / nums.length }
}

/** Куски строки для показа: текст и числа (число — отдельным куском, его выделяют). */
export function modTextParts(m: ModText, fmt: (n: number) => string): Array<{ text: string; num?: true }> {
  const out: Array<{ text: string; num?: true }> = []
  const pieces = m.text.split('#')
  pieces.forEach((piece, k) => {
    if (piece) out.push({ text: piece })
    if (k === pieces.length - 1) return
    const n = m.nums?.[k]
    if (n === undefined) out.push({ text: '…' })
    else out.push({ text: `${m.plus[k] ? '+' : ''}${fmt(n)}`, num: true })
  })
  return out
}

/** Строка целиком (для подписей и карточки лота). */
export function modTextString(m: ModText, fmt: (n: number) => string): string {
  return modTextParts(m, fmt)
    .map((p) => p.text)
    .join('')
    .trim()
}
