// Английское название валюты после числа (S18): «1 Divine Orb», «149 Chaos Orbs», «2 Orbs of Alchemy».
// Множественное у главного слова: перед « of », иначе последнее слово.

/** Ровно одна штука: 1 / «1» / «≈ 1»; 1.5, 0, 21 — уже множественное. */
export function enIsOne(value: number | string): boolean {
  if (typeof value === 'number') return Math.abs(value) === 1
  const m = /\d[\d,]*(?:\.\d+)?/.exec(value)
  return !!m && Number(m[0].replace(/,/g, '')) === 1
}

function pluralWord(w: string): string {
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`
  return `${w}s`
}

/** «Chaos Orb» → «Chaos Orbs», «Mirror of Kalandra» → «Mirrors of Kalandra»; mass («Gold») не меняется. */
export function pluralEn(name: string, value: number | string, mass = false): string {
  if (mass || enIsOne(value)) return name
  const of = name.indexOf(' of ')
  if (of > 0) {
    const before = name.slice(0, of)
    const sp = before.lastIndexOf(' ')
    return before.slice(0, sp + 1) + pluralWord(before.slice(sp + 1)) + name.slice(of)
  }
  const sp = name.lastIndexOf(' ')
  return name.slice(0, sp + 1) + pluralWord(name.slice(sp + 1))
}
