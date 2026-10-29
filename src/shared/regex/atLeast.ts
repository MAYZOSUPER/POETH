// Регулярка «число ≥ n» для поиска игры (n = 0…999; числа в подсказке — до 999,
// для n < 100 верно и для любых длинных чисел).
//
// Используется в контексте `<метка>.*<atLeast(n)>%`: число в подсказке всегда стоит перед «%»,
// поэтому вместо \d можно писать «.» (короче) — без «%» сразу после шаблон не совпадёт.
// Длинные числа совпадают «хвостом» (у 180 % хвост 80 % ≥ 80) — это верно, т. к. число ≥ хвоста.
// Примеры: atLeast(80) → ([89].|\d..), atLeast(85) → (8[5-9]|9.|\d..), atLeast(100) → [1-9]..
//
// opts.digit — чем обозначать «любая цифра» внутри: '.' (по умолчанию, перед «%») или '\\d'
// (когда после числа нет «%», например «Level: 20»).

export interface AtLeastOptions {
  digit?: '.' | '\\d'
  /**
   * Число целиком: слева от него стоит текст («\+» в «+25% to Fire Resistance»), поэтому длинное число
   * «хвостом» уже не совпадёт — добавляем все длины до 3 цифр (S27, «Торговец»).
   */
  whole?: boolean
}

/** Класс цифр a..b: «8», «[89]», «[5-9]», «.» (0–9). */
function digitRange(a: number, b: number, any: string): string {
  if (a === b) return String(a)
  if (a === 0 && b === 9) return any
  if (b === a + 1) return `[${a}${b}]`
  return `[${a}-${b}]`
}

/** Альтернативы для чисел той же длины, что s, и не меньше s (s может начинаться с 0 внутри). */
function sameLength(s: string, any: string): string[] {
  const d = Number(s[0])
  const rest = s.slice(1)
  if (rest.length === 0) return [digitRange(d, 9, any)]
  if (/^0+$/.test(rest)) return [digitRange(d, 9, any) + any.repeat(rest.length)]
  const out = sameLength(rest, any).map((alt) => String(d) + alt)
  if (d < 9) out.push(digitRange(d + 1, 9, any) + any.repeat(rest.length))
  return out
}

export function atLeast(n: number, opts: AtLeastOptions = {}): string {
  const any = opts.digit ?? '.'
  if (!Number.isInteger(n) || n < 0 || n > 999) throw new RangeError(`atLeast: n=${n} вне 0…999`)
  if (n === 0) return opts.whole ? '\\d+' : '\\d'
  const s = String(n)
  const alts = sameLength(s, any)
  // числа длиннее n: первая цифра — \d (не «.», чтобы не схватить «+» или пробел)
  if (s.length < 3) alts.push('\\d' + any.repeat(s.length))
  if (opts.whole) for (let len = s.length + 2; len <= 3; len++) alts.push('\\d' + any.repeat(len - 1))
  return alts.length === 1 ? alts[0] : `(${alts.join('|')})`
}
